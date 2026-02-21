import React, { useState } from "react";
import { CharaTableData, ParentEntry } from "./types";
import { aggregateFactors, formatFactor, getCharaImageUrl, getFactorColor } from "./utils";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import CharaProperLabels from "../../../CharaProperLabels";
import { charaTableColumns } from "./columns";
import { getSkillDef } from "../../../RaceReplay/utils/SkillDataUtils";
import { getCourseAptitudeFilters } from "../../../../pages/MultiRacePage/utils";
import AssetLoader from "../../../../data/AssetLoader";

const ChevronIcon = () => (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
);

interface CharaTableProps {
    data: CharaTableData[];
    courseId?: number;
}

const ParentGroup = ({ parents }: { parents: ParentEntry[] }) => {
    const sortedParents = [...parents].sort((a, b) => a.positionId - b.positionId);
    if (sortedParents.length === 0) return null;

    const aggregatedFactors = aggregateFactors(sortedParents);

    return (
        <div className="parent-group-container">
            <div className="parent-images-flex">
                {sortedParents.map((p, idx) => (
                    <img
                        key={idx}
                        src={getCharaImageUrl(p.cardId)}
                        alt={String(p.cardId)}
                        className="parent-img"
                        title={`ID: ${p.cardId} (Pos: ${p.positionId})`}
                        onError={(e) => (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzU1NSIvPjwvc3ZnPg=='}
                    />
                ))}
            </div>
            <div className="d-flex flex-wrap">
                {aggregatedFactors.length === 0 ? <span className="text-muted">No factors</span> : aggregatedFactors.map((f, fIdx) => {
                    let name = f.nameOverride;
                    if (!name) {
                        const formatted = formatFactor(f.id);
                        name = formatted ? formatted.name : `Factor ${f.id}`;
                    }
                    return (
                        <span key={fIdx} className="factor-badge">
                            <span style={{ color: getFactorColor(f.id), fontWeight: 600 }}>{name}</span>
                            <span style={{ color: '#9ca3af' }}>{f.level}★</span>
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

const CharaTable: React.FC<CharaTableProps> = ({ data, courseId }) => {
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
    const [tableCollapsed, setTableCollapsed] = useState(false);

    const aptitudeFilters = getCourseAptitudeFilters(courseId);

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
                        {charaTableColumns.map(col => {
                            if (col.key === 'expand') {
                                return (
                                    <th key={col.key}>
                                        <button
                                            onClick={() => setTableCollapsed(prev => !prev)}
                                            title={tableCollapsed ? 'Expand table' : 'Collapse table'}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 4px', fontSize: '0.75rem' }}
                                        >
                                            {tableCollapsed ? '▶' : '▼'}
                                        </button>
                                    </th>
                                );
                            }
                            return <th key={col.key}>{col.header}</th>;
                        })}
                    </tr>
                </thead>
                <tbody>
                    {!tableCollapsed && data.flatMap(row => {
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
                                    <div className="dashboard-grid">
                                        {/* Skills Panel */}
                                        <div className="dashboard-panel panel-skills">
                                            <div className="dashboard-panel-header">
                                                Skills ({row.trainedChara.skills.length})
                                            </div>
                                            <div className="skills-list">
                                                {(() => {
                                                    const inherentSkill = row.trainedChara.skills.length > 0 ? row.trainedChara.skills[0] : undefined;

                                                    const otherSkills = row.trainedChara.skills.slice(1).sort((a, b) => {
                                                        const aUsed = row.activatedSkillCounts.has(a.skillId) ? 1 : 0;
                                                        const bUsed = row.activatedSkillCounts.has(b.skillId) ? 1 : 0;
                                                        // Sort by used (descending), then iconid (ascending)
                                                        if (aUsed !== bUsed) return bUsed - aUsed;

                                                        const aDef = getSkillDef(a.skillId);
                                                        const bDef = getSkillDef(b.skillId);
                                                        return (aDef?.iconid || 0) - (bDef?.iconid || 0);
                                                    });

                                                    const sortedSkills = inherentSkill ? [inherentSkill, ...otherSkills] : otherSkills;

                                                    return sortedSkills.map((cs, idx) => {
                                                        const count = row.activatedSkillCounts.get(cs.skillId);
                                                        const skillDef = getSkillDef(cs.skillId);
                                                        return (
                                                            <div key={idx} className="skill-item">
                                                                <div className="skill-info">
                                                                    {skillDef?.iconid ? (
                                                                        <img
                                                                            src={AssetLoader.getSkillIcon(skillDef.iconid)}
                                                                            alt=""
                                                                            className="skill-icon"
                                                                        />
                                                                    ) : (
                                                                        <div className="skill-icon"></div>
                                                                    )}
                                                                    <span>{UMDatabaseWrapper.skillName(cs.skillId)}</span>
                                                                </div>
                                                                {count ? (
                                                                    <span className={`skill-badge ${count > 1 ? 'multiple' : ''}`}>
                                                                        {count > 1 ? `${count}x Used` : 'Used'}
                                                                    </span>
                                                                ) : (
                                                                    <span className="skill-badge failed">
                                                                        ✕
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                        </div>

                                        {/* Aptitudes & Deck Panel */}
                                        <div className="dashboard-panel panel-aptitudes">
                                            <div className="dashboard-panel-header">
                                                Aptitudes
                                            </div>
                                            <div className="aptitude-container">
                                                <CharaProperLabels
                                                    chara={row.trainedChara}
                                                    groundFilter={aptitudeFilters?.ground}
                                                    distanceFilter={aptitudeFilters?.distance}
                                                    runningStyleFilter={row.horseResultData.runningStyle}
                                                />
                                            </div>

                                            {row.deck && row.deck.length > 0 && (
                                                <>
                                                    <div className="dashboard-panel-header" style={{ marginTop: 'auto', paddingTop: '16px' }}>
                                                        Support Deck
                                                    </div>
                                                    <div className="support-deck-grid">
                                                        {row.deck.map((card) => (
                                                            <div key={card.position} className="support-card-wrapper" title={`ID: ${card.id}`}>
                                                                <img
                                                                    src={AssetLoader.getSupportCardIcon(card.id) ?? ""}
                                                                    alt={String(card.id)}
                                                                    className="support-card-img"
                                                                    onError={(e) => {
                                                                        const target = e.target as HTMLImageElement;
                                                                        target.style.display = 'none';
                                                                        if (target.parentElement) {
                                                                            target.parentElement.innerText = String(card.id);
                                                                        }
                                                                    }}
                                                                />
                                                                <div className="support-card-lb">
                                                                    LB {card.lb}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* Inheritance Panel */}
                                        {(parentGroup1.length > 0 || parentGroup2.length > 0) && (
                                            <div className="dashboard-panel panel-inheritance">
                                                <div className="dashboard-panel-header">
                                                    Parents
                                                </div>
                                                <div className="parents-list">
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
