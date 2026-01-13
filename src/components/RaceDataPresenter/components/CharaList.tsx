import React from "react";
import { Badge, OverlayTrigger, Table, Tooltip } from "react-bootstrap";
import BootstrapTable, { ColumnDescription, ExpandRowProps } from "react-bootstrap-table-next";
import _ from "lodash";
import { Chara } from "../../../data/data_pb";
import {
    RaceSimulateData,
    RaceSimulateHorseResultData,
} from "../../../data/race_data_pb";
import {
    getCharaActivatedSkillIds,
} from "../../../data/RaceDataUtils";
import { fromRaceHorseData, TrainedCharaData } from "../../../data/TrainedCharaData";
import * as UMDatabaseUtils from "../../../data/UMDatabaseUtils";
import UMDatabaseWrapper from "../../../data/UMDatabaseWrapper";
import CardNamePresenter from "../../CardNamePresenter";
import CharaProperLabels from "../../CharaProperLabels";
import CopyButton from "../../CopyButton";
import FoldCard from "../../FoldCard";
import {
    calculateRaceDistance,
    getColorForSpurtDelay,
    runningStyleLabel,
    unknownCharaTag,
} from "../utils/RacePresenterUtils";

type SupportCardEntry = {
    position: number;
    id: number;
    lb: number;
    exp: number;
};

type ParentEntry = {
    positionId: number;
    cardId: number;
    rank: number;
    factors: { id: number; level: number }[];
};

type CharaTableData = {
    trainedChara: TrainedCharaData,
    chara: Chara | undefined,

    frameOrder: number,
    finishOrder: number,

    horseResultData: RaceSimulateHorseResultData,

    popularity: number,
    popularityMarks: number[],
    motivation: number,

    activatedSkills: Set<number>,

    raceDistance: number,

    deck: SupportCardEntry[],
    parents: ParentEntry[],
};

const getFactorCategory = (factorId: number): number => {
    const idStr = String(factorId);
    const length = idStr.length;

    if (length === 3) return 1;
    if (length === 4) return 2;
    if (length === 8) return 3;
    if (length === 7 && (idStr.startsWith('1') || idStr.startsWith('3'))) return 4;
    return 5;
};

const getFactorColor = (factorId: number): string => {
    const category = getFactorCategory(factorId);
    switch (category) {
        case 1: return 'rgb(55, 183, 244)'; // Blue
        case 2: return 'rgb(255, 118, 178)'; // Pink/Red
        case 3: return 'rgb(120, 208, 96)';  // Green
        case 4: return 'rgb(200, 162, 200)'; // Purple
        default: return '#fff';
    }
};

const formatFactor = (factorId: number): { name: string; level: number } | null => {
    const level = factorId % 100;
    const textData = UMDatabaseWrapper.getTextData(147, factorId);

    if (textData?.text && textData.category === 147) {
        return { name: textData.text, level };
    }
    return null;
};

const getCharaImageUrl = (cardId: number): string => {
    const cardIdStr = String(cardId);
    const first4Digits = cardIdStr.substring(0, 4);
    return `https://gametora.com/images/umamusume/characters/thumb/chara_stand_${first4Digits}_${cardId}.png`;
};

type AggregatedFactor = {
    id: number;
    level: number;
    nameOverride?: string;
};

const aggregateFactors = (parents: ParentEntry[]): AggregatedFactor[] => {
    const map = new Map<string, { totalLevel: number, representativeId: number }>();

    parents.forEach(p => {
        p.factors.forEach(f => {
            const formatted = formatFactor(f.id);
            const name = formatted ? formatted.name : `Factor ${f.id}`;
            
            let itemLevel = f.level;
            if (!itemLevel || itemLevel === 0) {
                const cat = getFactorCategory(f.id);
                if (formatted && (cat === 1 || cat === 2 || cat === 3)) {
                    itemLevel = formatted.level;
                }
            }
            const valToAdd = itemLevel || 0;

            const current = map.get(name);
            if (current) {
                current.totalLevel += valToAdd;
            } else {
                map.set(name, { totalLevel: valToAdd, representativeId: f.id });
            }
        });
    });

    const result: AggregatedFactor[] = [];
    map.forEach((val, name) => {
        result.push({ 
            id: val.representativeId, 
            level: val.totalLevel, 
            nameOverride: name 
        });
    });

    return result.sort((a, b) => {
        const catA = getFactorCategory(a.id);
        const catB = getFactorCategory(b.id);
        if (catA !== catB) return catA - catB;
        return a.id - b.id;
    });
};

const charaTableColumns: ColumnDescription<CharaTableData>[] = [
    {
        dataField: 'copy',
        isDummyField: true,
        text: '',
        formatter: (cell, row) => <CopyButton content={JSON.stringify(row.trainedChara.rawData)} />,
    },
    {
        dataField: 'finishOrder',
        text: 'Finish',
        sort: true,
    },
    {
        dataField: 'frameOrder',
        text: 'No.',
        sort: true,
    },
    {
        dataField: 'chara',
        text: '',
        formatter: (chara: Chara | undefined, row) => chara ? <>
            {chara.name} {row.trainedChara.viewerName ? `[${row.trainedChara.viewerName}]` : ''} <CardNamePresenter cardId={row.trainedChara.cardId} />
        </> : unknownCharaTag,
    },
    {
        dataField: 'df2',
        isDummyField: true,
        text: 'Time',
        formatter: (cell, row) => <>
            {UMDatabaseUtils.formatTime(row.horseResultData.finishTime!)}
            <br />{UMDatabaseUtils.formatTime(row.horseResultData.finishTimeRaw!)}
        </>,
    },
    {
        dataField: 'df3',
        isDummyField: true,
        text: '',
        formatter: (cell, row) => <>
            {runningStyleLabel(row.horseResultData, row.activatedSkills)}
            <br />Mood: {UMDatabaseUtils.motivationLabels[row.motivation]}
        </>,
    },
    {
        dataField: 'lastSpurt',
        isDummyField: true,
        text: 'Spurt delay',
        headerFormatter: () => {
            return (
                <span>
                    Spurt delay{' '}
                    <OverlayTrigger
                        placement="top"
                        overlay={
                            <Tooltip id={`tooltip-spurt-delay`}>
                                High values indicate a lack of HP when entering late-race. Values below roughly 4m aren't indicative of any problems with HP.
                            </Tooltip>
                        }
                    >
                        <span style={{ cursor: 'help', borderBottom: '1px dotted #fff' }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            );
        },
        formatter: (cell, row) => {
            const dist = row.horseResultData.lastSpurtStartDistance;
            if (!dist) return '-';
            if (dist === -1) {
                return <span style={{ color: '#dc3545', fontWeight: 'bold' }}>No spurt</span>;
            }

            const phase3Start = row.raceDistance * 2 / 3;
            const delay = dist - phase3Start;
            const color = getColorForSpurtDelay(delay);

            return (
                <span style={{ color, fontWeight: 'bold' }}>{delay.toFixed(2)}m</span>
            );
        },
    },
    {
        dataField: 'rankScore',
        isDummyField: true,
        text: 'Score',
        formatter: (cell, row) => row.trainedChara.rankScore,
    },
    {
        dataField: 'speed',
        isDummyField: true,
        text: 'Speed',
        formatter: (cell, row) => row.trainedChara.speed,
    },
    {
        dataField: 'stamina',
        isDummyField: true,
        text: 'Stamina',
        formatter: (cell, row) => row.trainedChara.stamina,
    },
    {
        dataField: 'pow',
        isDummyField: true,
        text: 'Power',
        formatter: (cell, row) => row.trainedChara.pow,
    },
    {
        dataField: 'guts',
        isDummyField: true,
        text: 'Guts',
        formatter: (cell, row) => row.trainedChara.guts,
    },
    {
        dataField: 'wiz',
        isDummyField: true,
        text: 'Wit',
        formatter: (cell, row) => row.trainedChara.wiz,
    },
];

const renderParentGroup = (parents: ParentEntry[], groupName: string) => {
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

const charaTableExpandRow: ExpandRowProps<CharaTableData> = {
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
                                <td>{row.activatedSkills.has(cs.skillId) ? 'Used' : ''}</td>
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

                {(parentGroup1.length > 0 || parentGroup2.length > 0) && (
                    <div className="m-2 d-flex flex-column" style={{ flex: '1 1 300px', minWidth: '300px', maxWidth: '100%' }}>
                        <div className="d-flex flex-column mt-1">
                            {renderParentGroup(parentGroup1, "Parent 1")}
                            {renderParentGroup(parentGroup2, "Parent 2")}
                        </div>
                    </div>
                )}

            </div >
        );
    },
    showExpandColumn: true,
};

type CharaListProps = {
    raceHorseInfo: any[];
    raceData: RaceSimulateData;
};

const CharaList: React.FC<CharaListProps> = ({ raceHorseInfo, raceData }) => {
    if (!raceHorseInfo || raceHorseInfo.length === 0) {
        return null;
    }

    const raceDistance = calculateRaceDistance(raceData);

    const l: CharaTableData[] = raceHorseInfo.map(data => {
        const frameOrder = data['frame_order'] - 1;

        const horseResult = raceData.horseResult[frameOrder];

        const trainedCharaData = fromRaceHorseData(data);
        return {
            trainedChara: trainedCharaData,
            chara: UMDatabaseWrapper.charas[trainedCharaData.charaId],

            frameOrder: frameOrder + 1,
            finishOrder: horseResult.finishOrder! + 1,

            horseResultData: horseResult,

            popularity: data['popularity'],
            popularityMarks: data['popularity_mark_rank_array'],
            motivation: data['motivation'],

            activatedSkills: getCharaActivatedSkillIds(raceData, frameOrder),

            raceDistance: raceDistance,

            deck: data.deck || [],
            parents: data.parents || [],
        };
    });

    return <FoldCard header="Umas">
        <BootstrapTable bootstrap4 condensed hover
            classes="responsive-bootstrap-table"
            wrapperClasses="table-responsive"
            expandRow={charaTableExpandRow}
            data={_.sortBy(l, d => d.finishOrder)} columns={charaTableColumns} keyField="frameOrder" />
    </FoldCard>;
};

export default CharaList;