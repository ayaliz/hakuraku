import React from "react";
import { Badge, Card } from "react-bootstrap";
import { Veteran } from "./types";
import { aggregateFactors, getFactorCategory } from "../../data/VeteransHelper";
import { getCardName, formatCardName, getCharaImageUrl, getFactorColor } from "./VeteransUIHelper";

interface VeteranCardProps {
    veteran: Veteran;
    config: any;
}

const VeteranCard: React.FC<VeteranCardProps> = ({ veteran, config }) => {
    const parent1 = veteran.succession_chara_array.find(p => p.position_id === 10);
    const parent2 = veteran.succession_chara_array.find(p => p.position_id === 20);
    const aggregated = aggregateFactors(veteran);

    const renderStars = (level: number, isGolden: boolean) => {
        return <span style={{ color: isGolden ? '#FFD700' : 'inherit' }}>{'★'.repeat(level)}</span>;
    };

    return (
        <Card className="mb-3">
            <Card.Body>
                <div className="d-flex align-items-start">
                    <div style={{ marginRight: '2rem' }}>
                        <div className="mb-2">
                            <h5 className="mb-1">{formatCardName(getCardName(veteran.card_id))}</h5>
                            <div className="text-muted">Rating: {veteran.rank_score}</div>
                        </div>

                        <div className="d-flex">
                            <div className="me-2">
                                <img
                                    src={getCharaImageUrl(veteran.card_id)}
                                    alt={getCardName(veteran.card_id)}
                                    width="128"
                                    height="128"
                                    style={{ objectFit: 'contain' }}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="128" height="128"%3E%3Crect width="128" height="128" fill="%23ddd"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999"%3ENo Image%3C/text%3E%3C/svg%3E';
                                    }}
                                />
                            </div>

                            <div className="d-flex flex-column">
                                {[parent1, parent2].map((parent, pIdx) => parent && (
                                    <img
                                        key={pIdx}
                                        src={getCharaImageUrl(parent.card_id)}
                                        alt={getCardName(parent.card_id)}
                                        width="64"
                                        height="64"
                                        style={{ objectFit: 'contain', marginBottom: pIdx === 0 ? '0' : undefined }}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex-grow-1">
                        <div className="mb-3">
                            {aggregated.length === 0 ? (
                                <small className="text-muted">No factors</small>
                            ) : (
                                [1, 2, 3, 4, 5].map(catId => {
                                    const group = aggregated.filter(f => getFactorCategory(f.factorId) === catId);
                                    if (group.length === 0) return null;
                                    
                                    return (
                                        <div key={catId} className="mb-1">
                                            {group.map((factor, idx) => (
                                                <Badge
                                                    key={idx}
                                                    bg="secondary"
                                                    className="mb-1"
                                                    style={{ fontSize: '0.9rem', backgroundColor: '#4a4a4a', marginRight: '0.5rem' }}
                                                >
                                                    <span style={{ color: getFactorColor(factor.factorId, config) }}>
                                                        {factor.name}
                                                    </span>{' '}
                                                    {renderStars(factor.level, factor.isGold)}
                                                </Badge>
                                            ))}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </Card.Body>
        </Card>
    );
};

export default VeteranCard;