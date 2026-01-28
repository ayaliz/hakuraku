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
    filterCharaSkills,
} from "../../../data/RaceDataUtils";
import { fromRaceHorseData, TrainedCharaData } from "../../../data/TrainedCharaData";
import { adjustStat } from "../../RaceReplay/utils/speedCalculations";
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
import {
    calculateTargetSpeed,
    getDistanceCategory,
    calculateReferenceHpConsumption
} from "../../RaceReplay/utils/speedCalculations";
import {
    getPassiveStatModifiers,
    getActiveSpeedModifier,
    getSkillBaseTime,
    hasSkillEffect
} from "../../RaceReplay/utils/SkillDataUtils";
import { useAvailableTracks } from "../../RaceReplay/hooks/useAvailableTracks";
import { useGuessTrack } from "../../RaceReplay/hooks/useGuessTrack";
import courseData from "../../../data/tracks/course_data.json";

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
    activatedSkillCounts: Map<number, number>,

    raceDistance: number,

    deck: SupportCardEntry[],
    parents: ParentEntry[],

    startDelay?: number;
    isLateStart?: boolean;
    lastSpurtTargetSpeed?: number;
    maxAdjustedSpeed?: number;
    hpOutcome?: { type: 'died'; distance: number; deficit: number } | { type: 'survived'; hp: number };
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
        headerFormatter: () => {
            return (
                <span>
                    Time{' '}
                    <OverlayTrigger
                        placement="bottom"
                        overlay={
                            <Tooltip id={`tooltip-time`}>
                                The first value is the ingame time, the second is the simulation time. The ingame time is typically nonsense and heavily manipulated to match real world race times on this track.
                            </Tooltip>
                        }
                    >
                        <span style={{ cursor: 'help', borderBottom: '1px dotted #fff' }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            );
        },
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
        dataField: 'startDelay',
        isDummyField: true,
        text: 'Start delay',
        headerFormatter: () => {
            return (
                <span>
                    Start delay{' '}
                    <OverlayTrigger
                        placement="bottom"
                        overlay={
                            <Tooltip id={`tooltip-start-delay`}>
                                Ingame, a start delay of 0.08 or worse is marked as a late start. However, the most devestating effect of high start delay is the loss of 1 frame of acceleration which already occurrs at 0.066, so any start that loses that frame of acceleration is marked as a late start here
                            </Tooltip>
                        }
                    >
                        <span style={{ cursor: 'help', borderBottom: '1px dotted #fff' }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            );
        },
        formatter: (cell, row) => (
            <>
                {row.startDelay !== undefined ? row.startDelay.toFixed(5) : '-'}
                <br />
                {row.isLateStart ? (
                    <span style={{ color: '#dc3545', fontWeight: 'bold', fontSize: '0.85em' }}>Late start</span>
                ) : (
                    <span style={{ color: '#28a745', fontWeight: 'bold', fontSize: '0.85em' }}>Normal start</span>
                )}
            </>
        ),
    },
    {
        dataField: 'lastSpurt',
        isDummyField: true,
        text: 'Last spurt',
        headerFormatter: () => {
            return (
                <span>
                    Last spurt{' '}
                    <OverlayTrigger
                        placement="bottom"
                        overlay={
                            <Tooltip id={`tooltip-spurt-delay`}>
                                If an uma did a full last spurt, you should see a spurt delay &lt;3m as well as an observed speed matching the theoretical speed. (Theoretical speed calculation requires the correct track to be selected, see top left of Replay)
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

            const diff = (row.maxAdjustedSpeed && row.lastSpurtTargetSpeed)
                ? row.maxAdjustedSpeed - row.lastSpurtTargetSpeed
                : 0;
            const reached = diff >= -0.05;

            return (
                <div style={{ lineHeight: 1.2 }}>
                    <div>
                        Delay: <span style={{ color, fontWeight: 'bold' }}>{delay.toFixed(2)}m</span>
                    </div>
                    {row.maxAdjustedSpeed && row.lastSpurtTargetSpeed ? (
                        <div style={{ fontSize: '0.85em', color: reached ? '#28a745' : '#dc3545' }} title="Max Speed Reached vs Theoretical Target">
                            <span style={{ color: '#fff' }}>Speed:</span> {row.maxAdjustedSpeed.toFixed(2)} <span style={{ opacity: 0.8 }}>({diff > 0 ? '+' : ''}{diff.toFixed(2)})</span>
                        </div>
                    ) : null}
                </div>
            );
        },
    },
    {
        dataField: 'hpOutcome',
        isDummyField: true,
        text: 'HP Result',
        headerFormatter: () => {
            return (
                <span>
                    HP Result{' '}
                    <OverlayTrigger
                        placement="bottom"
                        overlay={
                            <Tooltip id={`tooltip-hp-result`}>
                                If the character ran out of HP, shows how far from the finish line they were when it happened. Otherwise shows remaining HP at the finish.
                            </Tooltip>
                        }
                    >
                        <span style={{ cursor: 'help', borderBottom: '1px dotted #fff' }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            );
        },
        formatter: (cell, row) => {
            if (!row.hpOutcome) return '-';
            if (row.hpOutcome.type === 'died') {
                return (
                    <div>
                        <span style={{ color: '#dc3545', fontWeight: 'bold' }}>Died {row.hpOutcome.distance.toFixed(2)}m early</span>
                        <br />
                        <span style={{ fontSize: '0.85em', color: '#dc3545' }}>Missed ~{row.hpOutcome.deficit.toFixed(0)} HP</span>
                    </div>
                );
            } else {
                return <span style={{ color: '#28a745', fontWeight: 'bold' }}>Survived with {Math.round(row.hpOutcome.hp)} HP</span>;
            }
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
    detectedCourseId?: number;
    skillActivations?: Record<number, { time: number; name: string; param: number[] }[]>;
    otherEvents?: Record<number, { time: number; duration: number; name: string }[]>;
};

const CharaList: React.FC<CharaListProps> = ({ raceHorseInfo, raceData, detectedCourseId, skillActivations, otherEvents }) => {
    const raceDistance = calculateRaceDistance(raceData);

    const availableTracks = useAvailableTracks(raceDistance);
    const { selectedTrackId } = useGuessTrack(detectedCourseId, raceDistance, availableTracks);
    const effectiveCourseId = selectedTrackId ? parseInt(selectedTrackId) : undefined;

    if (!raceHorseInfo || raceHorseInfo.length === 0) {
        return null;
    }

    const distanceCategory = getDistanceCategory(raceDistance);
    const trackSlopes = effectiveCourseId ? (courseData as any)[effectiveCourseId]?.slopes ?? [] : [];



    const l: CharaTableData[] = raceHorseInfo.map(data => {
        const frameOrder = data['frame_order'] - 1;

        const horseResult = raceData.horseResult[frameOrder];

        const trainedCharaData = fromRaceHorseData(data);


        // Calculate Last Spurt Speed
        const skillEvents = filterCharaSkills(raceData, frameOrder);
        const activatedSkillIds = new Set(skillEvents.map(e => e.param[1]));
        const activatedSkillCounts = new Map<number, number>();
        skillEvents.forEach(e => {
            const skillId = e.param[1];
            activatedSkillCounts.set(skillId, (activatedSkillCounts.get(skillId) || 0) + 1);
        });
        const passiveStats = { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 };
        activatedSkillIds.forEach(id => {
            const mods = getPassiveStatModifiers(id);
            passiveStats.speed += mods.speed || 0;
            passiveStats.stamina += mods.stamina || 0;
            passiveStats.power += mods.power || 0;
            passiveStats.guts += mods.guts || 0;
            passiveStats.wisdom += mods.wisdom || 0;
        });

        // Determine strategy
        const runningStyleStr = data.running_style ?? 0;
        const strategy = +runningStyleStr > 0 ? +runningStyleStr : (trainedCharaData.rawData?.param?.runningStyle ?? 1);

        // Oonige
        let isOonige = false;
        if (activatedSkillIds.has(202051)) isOonige = true;

        // Check for Late Start (0 acceleration at frame 0)
        let isLateStart = false;
        if (raceData.frame && raceData.frame.length > 1) {
            const f0 = raceData.frame[0];
            const f1 = raceData.frame[1];
            const h0 = f0.horseFrame?.[frameOrder];
            const h1 = f1.horseFrame?.[frameOrder];

            if (h0 && h1) {
                const v0 = (h0.speed ?? 0) / 100;
                const v1 = (h1.speed ?? 0) / 100;
                const dt = (f1.time ?? 0) - (f0.time ?? 0);

                if (dt > 0) {
                    const accel = (v1 - v0) / dt;
                    if (accel < 0.0001) {
                        isLateStart = true;
                    }
                }
            }
        }

        const distProficiency = trainedCharaData.properDistances[distanceCategory] ?? 1;

        const lsRes = calculateTargetSpeed({
            courseDistance: raceDistance,
            currentDistance: raceDistance, // Force late game check
            speedStat: trainedCharaData.speed,
            wisdomStat: trainedCharaData.wiz,
            powerStat: trainedCharaData.pow,
            gutsStat: trainedCharaData.guts,
            staminaStat: trainedCharaData.stamina,
            strategy,
            distanceProficiency: distProficiency,
            mood: data['motivation'],
            isOonige,
            inLastSpurt: true, // Force last spurt
            slope: 0,
            greenSkillBonuses: passiveStats,
            activeSpeedBuff: 0,
            courseId: effectiveCourseId
        });

        const lastSpurtTargetSpeed = lsRes.base;

        let maxAdjSpeed = 0;
        let adjustedGuts = 0;
        if (raceData.frame) {
            adjustedGuts = adjustStat(trainedCharaData.guts, data['motivation'], passiveStats.guts);

            let wasType28Active = false;

            raceData.frame.forEach((frame, fIdx) => {
                const h = frame.horseFrame?.[frameOrder];
                if (!h) return;
                if ((h.distance ?? 0) > raceDistance) return;
                const speed = (h.speed ?? 0) / 100;
                if (speed <= 0) return;
                const time = frame.time ?? 0;

                let buff = 0;
                let isType28Active = false;

                // Skills
                if (skillActivations && skillActivations[frameOrder]) {
                    skillActivations[frameOrder].forEach(s => {
                        const baseTime = getSkillBaseTime(s.param[1]);
                        const duration = baseTime > 0 ? (baseTime / 10000) * (raceDistance / 1000) : 2.0;
                        if (time >= s.time && time < s.time + duration) {
                            buff += getActiveSpeedModifier(s.param[1]);
                            if (hasSkillEffect(s.param[1], 28)) {
                                isType28Active = true;
                            }
                        }
                    });
                }

                const shouldSkip = isType28Active || wasType28Active;
                wasType28Active = isType28Active;

                if (shouldSkip) return;

                // Events
                if (otherEvents && otherEvents[frameOrder]) {
                    otherEvents[frameOrder].forEach(e => {
                        if (time >= e.time && time < e.time + e.duration) {
                            const name = e.name || "";
                            if (name.includes("Spot Struggle") || name.includes("Competes (Pos)")) {
                                buff += Math.pow(500 * adjustedGuts, 0.6) * 0.0001;
                            }
                            if (name.includes("Dueling") || name.includes("Competes (Speed)")) {
                                buff += Math.pow(200 * adjustedGuts, 0.708) * 0.0001;
                            }

                        }
                    });
                }

                // Downhill
                const dist = h.distance ?? 0;
                const currentSlopeObj = trackSlopes.find((s: any) => dist >= s.start && dist < s.start + s.length);
                const currentSlope = currentSlopeObj?.slope ?? 0;

                if (currentSlope < 0) {
                    // Check for Downhill Mode
                    const nextFrame = raceData.frame[fIdx + 1];
                    if (nextFrame) {
                        const hNext = nextFrame.horseFrame?.[frameOrder];
                        if (hNext) {
                            const dt = (nextFrame.time ?? 0) - time;
                            if (dt > 0) {
                                const rate = ((h.hp ?? 0) - (hNext.hp ?? 0)) / dt;
                                const expected = calculateReferenceHpConsumption(speed, raceDistance);
                                if (expected > 0 && rate > 0 && rate < expected * 0.8) {
                                    buff += 0.3 + Math.abs(currentSlope) / 1000;
                                }
                            }
                        }
                    }
                }

                let isDecelerating = false;

                // Check previous (Backward diff)
                const prevFrame = fIdx > 0 ? raceData.frame[fIdx - 1] : undefined;
                if (prevFrame) {
                    const hPrev = prevFrame.horseFrame?.[frameOrder];
                    if (hPrev) {
                        const prevSpeed = (hPrev.speed ?? 0) / 100;
                        const dt = (time - (prevFrame.time ?? 0));
                        if (dt > 0) {
                            const accel = (speed - prevSpeed) / dt;
                            if (accel < -0.05) isDecelerating = true;
                        }
                    }
                }

                // Check next (Forward diff) - Catches the moment a buff drops but speed hasn't
                const nextFrame = fIdx < raceData.frame.length - 1 ? raceData.frame[fIdx + 1] : undefined;
                if (!isDecelerating && nextFrame) {
                    const hNext = nextFrame.horseFrame?.[frameOrder];
                    if (hNext) {
                        const nextSpeed = (hNext.speed ?? 0) / 100;
                        const dt = ((nextFrame.time ?? 0) - time);
                        if (dt > 0) {
                            const accel = (nextSpeed - speed) / dt;
                            if (accel < -0.05) isDecelerating = true;
                        }
                    }
                }

                if (isDecelerating) return;

                const adj = speed - buff;
                if (adj > maxAdjSpeed) maxAdjSpeed = adj;
            });
        }

        return {
            trainedChara: trainedCharaData,
            chara: UMDatabaseWrapper.charas[trainedCharaData.charaId],

            frameOrder: frameOrder + 1,
            finishOrder: horseResult.finishOrder! + 1,

            horseResultData: horseResult,

            popularity: data['popularity'],
            popularityMarks: data['popularity_mark_rank_array'],
            motivation: data['motivation'],

            activatedSkills: activatedSkillIds,
            activatedSkillCounts: activatedSkillCounts,

            raceDistance: raceDistance,

            deck: data.deck || [],
            parents: data.parents || [],

            startDelay: horseResult.startDelayTime,
            isLateStart,
            lastSpurtTargetSpeed,
            maxAdjustedSpeed: maxAdjSpeed,
            hpOutcome: (() => {
                const frames = raceData.frame ?? [];
                if (frames.length === 0) return undefined;

                const firstDeathFrame = frames.find(f => (f.horseFrame?.[frameOrder]?.hp ?? 1) === 0);

                if (firstDeathFrame) {
                    const dist = firstDeathFrame.horseFrame?.[frameOrder]?.distance ?? 0;
                    if (dist < raceDistance - 0.1) {
                        const distance = raceDistance - dist;
                        const baseSpeed = 20.0 - (raceDistance - 2000) / 1000;
                        const statusModifier = 1.0 + 200.0 / Math.sqrt(600.0 * adjustedGuts);
                        const currentSpeed = maxAdjSpeed || lastSpurtTargetSpeed || 20;

                        // HPConsumptionPerSecond = 20.0 * (CurrentSpeed - BaseSpeed + 12.0)^2 / 144.0 * StatusModifier * GroundModifier
                        const hpPerSec = 20.0 * Math.pow(currentSpeed - baseSpeed + 12.0, 2) / 144.0 * statusModifier * 1.0;
                        const time = distance / currentSpeed;
                        const deficit = time * hpPerSec;

                        return { type: 'died', distance, deficit };
                    }
                }

                const lastFrame = frames[frames.length - 1];
                const hp = lastFrame.horseFrame?.[frameOrder]?.hp ?? 0;
                return { type: 'survived', hp };
            })(),
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