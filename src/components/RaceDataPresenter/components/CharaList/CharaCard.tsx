import React, { useState } from "react";
import { Table } from "react-bootstrap";
import { CharaTableData, ParentEntry } from "./types";
import { aggregateFactors, formatFactor, getCharaImageUrl, getFactorColor } from "./utils";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import CharaProperLabels from "../../../CharaProperLabels";
import { charaTableColumns } from "./columns";

const ChevronIcon = () => (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
);

interface CharaTableProps {
    data: CharaTableData[];
}

const ParentGroup = ({ parents }: { parents: ParentEntry[] }) => {
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
                        <span
                            key={fIdx}
                            className="mb-1 mr-1 badge badge-dark"
                            style={{
                                marginRight: '3px',
                                backgroundColor: '#343a40',
                                border: '1px solid #555',
                                padding: '4px 6px'
                            }}
                        >
                            <span style={{ color: getFactorColor(f.id) }}>{name}</span>
                            {' '}{f.level}★
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

const CharaTable: React.FC<CharaTableProps> = ({ data }) => {
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

    const toggleRow = (frameOrder: number) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(frameOrder)) {
                next.delete(frameOrder);
            } else {
                next.add(frameOrder);
            }
            return next;
        });
    };

    return (
        <div className="chara-table-wrapper">
            <table className="chara-table">
                <thead>
                    <tr>
                        {charaTableColumns.map(col => (
                            <th key={col.key}>{col.header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.flatMap(row => {
                        const isExpanded = expandedRows.has(row.frameOrder);
                        const rank = row.finishOrder;
                        const rankClass = rank <= 3 ? `rank-${rank}` : '';

                        const parentGroup1 = row.parents.filter(p => Math.floor(p.positionId / 10) === 1);
                        const parentGroup2 = row.parents.filter(p => Math.floor(p.positionId / 10) === 2);

                        const mainRow = (
                            <tr key={`main-${row.frameOrder}`} className={isExpanded ? 'expanded' : ''} onClick={() => toggleRow(row.frameOrder)}>
                                {charaTableColumns.map(col => {
                                    // Special handling for certain columns
                                    if (col.key === 'expand') {
                                        return (
                                            <td key={col.key} className={col.cellClassName}>
                                                <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
                                                    <ChevronIcon />
                                                </span>
                                            </td>
                                        );
                                    }
                                    if (col.key === 'finishOrder') {
                                        return (
                                            <td key={col.key} className={`rank-cell ${rankClass}`}>
                                                {col.renderCell(row)}
                                            </td>
                                        );
                                    }

                                    const handleClick = col.stopPropagation ? (e: React.MouseEvent) => e.stopPropagation() : undefined;
                                    return (
                                        <td key={col.key} className={col.cellClassName} onClick={handleClick}>
                                            {col.renderCell(row)}
                                        </td>
                                    );
                                })}
                            </tr>
                        );

                        if (!isExpanded) {
                            return [mainRow];
                        }

                        const expandedRow = (
                            <tr key={`expanded-${row.frameOrder}`}>
                                <td colSpan={charaTableColumns.length} className="expanded-content">
                                    <div className="d-flex flex-row align-items-start flex-wrap">
                                        {/* Skills table - left */}
                                        <Table className="w-auto m-1">
                                            <tbody>
                                                {row.trainedChara.skills.map((cs, idx) => {
                                                    const count = row.activatedSkillCounts.get(cs.skillId);
                                                    return (
                                                        <tr key={idx}>
                                                            <td>{UMDatabaseWrapper.skillName(cs.skillId)}</td>
                                                            <td>Lv {cs.level}</td>
                                                            <td>
                                                                {count ? (
                                                                    count > 1 ? <strong>{count}x</strong> : 'Used'
                                                                ) : ''}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </Table>

                                        {/* Aptitudes + Deck - middle */}
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
                                                                src={`https://gametora.com/images/umamusume/supports/tex_support_card_${card.id}.png`}
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

                                        {/* Parents/Legacies - right */}
                                        {(parentGroup1.length > 0 || parentGroup2.length > 0) && (
                                            <div className="m-2 d-flex flex-column" style={{ flex: '1 1 300px', minWidth: '300px', maxWidth: '100%' }}>
                                                <div className="d-flex flex-column mt-1">
                                                    <ParentGroup parents={parentGroup1} />
                                                    <ParentGroup parents={parentGroup2} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );

                        return [mainRow, expandedRow];
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default CharaTable;
