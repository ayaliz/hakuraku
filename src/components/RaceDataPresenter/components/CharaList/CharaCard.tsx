import React, { useState } from "react";
import { OverlayTrigger, Tooltip, Table } from "react-bootstrap";
import { CharaTableData, ParentEntry } from "./types";
import { aggregateFactors, formatFactor, getCharaImageUrl, getFactorColor } from "./utils";
import { getColorForSpurtDelay, runningStyleLabel, unknownCharaTag } from "../../utils/RacePresenterUtils";
import * as UMDatabaseUtils from "../../../../data/UMDatabaseUtils";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import CardNamePresenter from "../../../CardNamePresenter";
import CopyButton from "../../../CopyButton";
import CharaProperLabels from "../../../CharaProperLabels";

const ChevronIcon = () => (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
);

interface CharaTableProps {
    data: CharaTableData[];
}

// Original-style parent group component
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
                        <th></th>
                        <th></th>
                        <th>Finish</th>
                        <th>No.</th>
                        <th>Character</th>
                        <th>
                            <span>
                                Time{' '}
                                <OverlayTrigger
                                    placement="bottom"
                                    overlay={
                                        <Tooltip id="tooltip-time">
                                            The first value is the simulation time (accurate); the second is the in-game time which is typically inaccurate and heavily manipulated to match real-world race times on this track.
                                        </Tooltip>
                                    }
                                >
                                    <span className="header-info" style={{ cursor: 'help', borderBottom: '1px dotted #fff' }}>ⓘ</span>
                                </OverlayTrigger>
                            </span>
                        </th>
                        <th>Style/Mood</th>
                        <th>
                            <span>
                                Start delay{' '}
                                <OverlayTrigger
                                    placement="bottom"
                                    overlay={
                                        <Tooltip id="tooltip-start-delay">
                                            Ingame, a start delay of 0.08 or worse is marked as a late start. However, the most devastating effect of high start delay is the loss of 1 frame of acceleration which already occurs at 0.066, so any start that loses that frame of acceleration is marked as a late start here
                                        </Tooltip>
                                    }
                                >
                                    <span className="header-info" style={{ cursor: 'help', borderBottom: '1px dotted #fff' }}>ⓘ</span>
                                </OverlayTrigger>
                            </span>
                        </th>
                        <th>
                            <span>
                                Last spurt{' '}
                                <OverlayTrigger
                                    placement="bottom"
                                    overlay={
                                        <Tooltip id="tooltip-spurt-delay">
                                            If an Uma performed a full last spurt, you should see a spurt delay &lt; 3m as well as an observed speed matching the theoretical speed. (Theoretical speed calculation requires the correct track to be selected; see the top left of Replay.) This data may look messed up for career races due to the hidden +400 stat modifier.
                                        </Tooltip>
                                    }
                                >
                                    <span className="header-info" style={{ cursor: 'help', borderBottom: '1px dotted #fff' }}>ⓘ</span>
                                </OverlayTrigger>
                            </span>
                        </th>
                        <th>
                            <span>
                                HP Result{' '}
                                <OverlayTrigger
                                    placement="bottom"
                                    overlay={
                                        <Tooltip id="tooltip-hp-result">
                                            Shows remaining HP if an Uma made it to the finish without running out of HP, otherwise shows an estimate for missing HP based on observed last spurt speed.
                                        </Tooltip>
                                    }
                                >
                                    <span className="header-info" style={{ cursor: 'help', borderBottom: '1px dotted #fff' }}>ⓘ</span>
                                </OverlayTrigger>
                            </span>
                        </th>
                        <th>Score</th>
                        <th>SPD</th>
                        <th>STA</th>
                        <th>POW</th>
                        <th>GUT</th>
                        <th>WIT</th>
                    </tr>
                </thead>
                <tbody>
                    {data.flatMap(row => {
                        const isExpanded = expandedRows.has(row.frameOrder);
                        const rank = row.finishOrder;
                        const rankClass = rank <= 3 ? `rank-${rank}` : '';

                        const spurtDist = row.horseResultData.lastSpurtStartDistance;
                        const phase3Start = row.raceDistance * 2 / 3;
                        const spurtDelay = spurtDist && spurtDist !== -1 ? spurtDist - phase3Start : null;
                        const spurtColor = spurtDelay !== null ? getColorForSpurtDelay(spurtDelay) : undefined;

                        const speedDiff = (row.maxAdjustedSpeed && row.lastSpurtTargetSpeed)
                            ? row.maxAdjustedSpeed - row.lastSpurtTargetSpeed : 0;
                        const speedReached = speedDiff >= -0.05;

                        const parentGroup1 = row.parents.filter(p => Math.floor(p.positionId / 10) === 1);
                        const parentGroup2 = row.parents.filter(p => Math.floor(p.positionId / 10) === 2);

                        const mainRow = (
                            <tr key={`main-${row.frameOrder}`} className={isExpanded ? 'expanded' : ''} onClick={() => toggleRow(row.frameOrder)}>
                                <td className="expand-cell">
                                    <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
                                        <ChevronIcon />
                                    </span>
                                </td>
                                <td className="copy-cell" onClick={e => e.stopPropagation()}>
                                    <CopyButton content={JSON.stringify(row.trainedChara.rawData)} />
                                </td>
                                <td className={`rank-cell ${rankClass}`}>{rank}</td>
                                <td className="stat-cell">{row.frameOrder}</td>
                                <td className="chara-name-cell">
                                    {row.chara ? (
                                        <>
                                            <span className="chara-name-primary">{row.chara.name}</span>
                                            <span className="chara-name-card"><CardNamePresenter cardId={row.trainedChara.cardId} /></span>
                                            {row.trainedChara.viewerName && (
                                                <span className="chara-viewer-name" style={{ opacity: 0.6 }}>[{row.trainedChara.viewerName}]</span>
                                            )}
                                        </>
                                    ) : unknownCharaTag}
                                </td>
                                <td className="time-cell">
                                    <span className="time-primary">{UMDatabaseUtils.formatTime(row.horseResultData.finishTimeRaw!)}</span>
                                    <span className="time-secondary">{UMDatabaseUtils.formatTime(row.horseResultData.finishTime!)}</span>
                                </td>
                                <td>
                                    <div style={{ lineHeight: 1.3 }}>
                                        <span className="style-badge">{runningStyleLabel(row.horseResultData, row.activatedSkills)}</span>
                                        <br />
                                        <span style={{ fontSize: '0.85em', color: '#9ca3af' }}>
                                            {UMDatabaseUtils.motivationLabels[row.motivation]}
                                        </span>
                                    </div>
                                </td>
                                <td>
                                    <div style={{ lineHeight: 1.2 }}>
                                        {row.startDelay !== undefined ? row.startDelay.toFixed(5) + 's' : '-'}
                                        <br />
                                        <span className={`mini-badge ${row.isLateStart ? 'danger' : 'success'}`}>
                                            {row.isLateStart ? 'Late' : 'Normal'}
                                        </span>
                                    </div>
                                </td>
                                <td>
                                    {spurtDist === -1 ? (
                                        <span className="status-bad">No spurt</span>
                                    ) : spurtDelay !== null ? (
                                        <div style={{ lineHeight: 1.3 }}>
                                            <span>Delay: <span style={{ color: spurtColor, fontWeight: 600 }}>{spurtDelay.toFixed(1)}m</span></span>
                                            {row.maxAdjustedSpeed && row.lastSpurtTargetSpeed && (
                                                <>
                                                    <br />
                                                    <span style={{ fontSize: '0.85em' }}>
                                                        <span style={{ color: '#e5e7eb' }}>Speed: </span>
                                                        <span style={{ color: speedReached ? '#4ade80' : '#f87171' }}>
                                                            {row.maxAdjustedSpeed.toFixed(1)} ({speedDiff > 0 ? '+' : ''}{speedDiff.toFixed(1)})
                                                        </span>
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    ) : '-'}
                                </td>
                                <td>
                                    {row.hpOutcome ? (
                                        row.hpOutcome.type === 'died' ? (
                                            <div style={{ lineHeight: 1.3 }}>
                                                <span className="status-bad">Died (-{row.hpOutcome.distance.toFixed(0)}m)</span>
                                                <br />
                                                <span style={{ fontSize: '0.85em', color: '#f87171' }}>
                                                    -{row.hpOutcome.deficit.toFixed(0)} HP ({((row.hpOutcome.deficit / row.hpOutcome.startHp) * 100).toFixed(1)}%)
                                                </span>
                                            </div>
                                        ) : (
                                            <div style={{ lineHeight: 1.3 }}>
                                                <span className="status-good">Survived</span>
                                                <br />
                                                <span style={{ fontSize: '0.85em', color: '#4ade80' }}>
                                                    {Math.round(row.hpOutcome.hp)} HP ({((row.hpOutcome.hp / row.hpOutcome.startHp) * 100).toFixed(1)}%)
                                                </span>
                                            </div>
                                        )
                                    ) : '-'}
                                </td>
                                <td className="stat-cell">{row.trainedChara.rankScore}</td>
                                <td className="stat-cell">{row.trainedChara.speed}</td>
                                <td className="stat-cell">{row.trainedChara.stamina}</td>
                                <td className="stat-cell">{row.trainedChara.pow}</td>
                                <td className="stat-cell">{row.trainedChara.guts}</td>
                                <td className="stat-cell">{row.trainedChara.wiz}</td>
                            </tr>
                        );

                        if (!isExpanded) {
                            return [mainRow];
                        }

                        // Original layout: Skills (left) | Aptitudes + Deck (middle) | Parents (right)
                        const expandedRow = (
                            <tr key={`expanded-${row.frameOrder}`}>
                                <td colSpan={16} className="expanded-content">
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
