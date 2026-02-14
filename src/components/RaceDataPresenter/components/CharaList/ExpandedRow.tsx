import React from "react";
import { Badge, Table } from "react-bootstrap";
import { ExpandRowProps } from "react-bootstrap-table-next";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import CharaProperLabels from "../../../CharaProperLabels";
import { CharaTableData, ParentEntry } from "./types";
import { aggregateFactors, formatFactor, getCharaImageUrl, getFactorColor } from "./utils";
import AssetLoader from "../../../../data/AssetLoader";

const ParentGroup = ({ parents }: { parents: ParentEntry[], groupName: string }) => {
    const sortedParents = [...parents].sort((a, b) => a.positionId - b.positionId);
    if (sortedParents.length === 0) return null;

    const aggregatedFactors = aggregateFactors(sortedParents);

    return (
        <div
            className="mb-2 p-2 border border-secondary rounded"
            style={{ backgroundColor: 'rgba(0,0,0,0.2)', width: '100%' }}
        >
            <div className="d-flex align-items-center mb-2 flex-wrap">
                {sortedParents.map((p, idx) => (
                    <img
                        key={idx}
                        src={getCharaImageUrl(p.cardId)}
                        alt={String(p.cardId)}
                        title={`ID: ${p.cardId} (Pos: ${p.positionId})`}
                        style={{ width: '64px', height: '64px', objectFit: 'contain', marginRight: '8px', marginBottom: '4px' }}
                        onError={(e) => (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzU1NSIvPjwvc3ZnPg=='}
                    />
                ))}
            </div>

            <div className="d-flex flex-wrap" style={{ fontSize: '0.95rem' }}>
                {aggregatedFactors.length === 0 ? <span className="text-muted">No factors</span> : aggregatedFactors.map((f, fIdx) => {
                    let name = f.nameOverride;
                    if (!name) {
                        const formatted = formatFactor(f.id);
                        name = formatted ? formatted.name : `Factor ${f.id}`;
                    }
                    return (
                        <Badge
                            key={fIdx}
                            variant="dark"
                            className="mb-1 mr-1"
                            style={{
                                marginRight: '3px',
                                backgroundColor: '#343a40',
                                border: '1px solid #555'
                            }}
                        >
                            <span style={{ color: getFactorColor(f.id) }}>
                                {name}
                            </span>
                            {' '}
                            {f.level}★
                        </Badge>
                    );
                })}
            </div>
        </div>
    );
};

export const expandRowOptions: ExpandRowProps<CharaTableData> = {
    renderer: row => {
        const parentGroup1 = row.parents.filter(p => Math.floor(p.positionId / 10) === 1);
        const parentGroup2 = row.parents.filter(p => Math.floor(p.positionId / 10) === 2);

        return (
            <div className="d-flex flex-row align-items-start flex-wrap">
                <Table className="w-auto m-1">
                    <tbody>
                        {row.trainedChara.skills.map((cs, idx) =>
                            <tr key={idx}>
                                <td>{UMDatabaseWrapper.skillName(cs.skillId)}</td>
                                <td>Lv {cs.level}</td>
                                <td>{(() => {
                                    const count = row.activatedSkillCounts.get(cs.skillId);
                                    if (!count) return '';
                                    return count > 1 ? <strong>{count}x</strong> : 'Used';
                                })()}</td>
                            </tr>,
                        )}
                    </tbody >
                </Table >

                <div className="d-flex flex-column m-2">
                    <div className="mb-2">
                        <CharaProperLabels chara={row.trainedChara} />
                    </div>

                    {row.deck && row.deck.length > 0 && (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '10px',
                            justifyItems: 'center',
                            padding: '10px',
                            borderRadius: '4px'
                        }}>
                            {row.deck.map((card) => (
                                <div key={card.position} className="text-center">
                                    <img
                                        src={AssetLoader.getSupportCardIcon(card.id) ?? ""}
                                        alt={String(card.id)}
                                        title={`ID: ${card.id}`}
                                        style={{
                                            width: '85px',
                                            height: 'auto',
                                            borderRadius: '5px',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                                        }}
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = 'none';
                                            if (target.parentElement) {
                                                target.parentElement.innerText = String(card.id);
                                            }
                                        }}
                                    />
                                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '2px' }}>
                                        LB {card.lb}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {(parentGroup1.length > 0 || parentGroup2.length > 0) && (
                    <div className="m-2 d-flex flex-column" style={{ flex: '1 1 300px', minWidth: '300px', maxWidth: '100%' }}>
                        <div className="d-flex flex-column mt-1">
                            <ParentGroup parents={parentGroup1} groupName="Parent 1" />
                            <ParentGroup parents={parentGroup2} groupName="Parent 2" />
                        </div>
                    </div>
                )}

            </div >
        );
    },
    showExpandColumn: true,
};
