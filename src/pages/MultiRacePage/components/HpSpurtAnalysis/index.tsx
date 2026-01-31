import React, { useMemo } from 'react';
import { Table, ProgressBar, Button, Modal } from 'react-bootstrap';
import BootstrapTable, { ColumnDescription, ExpandRowProps } from "react-bootstrap-table-next";
import 'react-bootstrap-table-next/dist/react-bootstrap-table2.min.css';
import _ from "lodash";

import { ParsedRace } from '../../types';
import { computeHpSpurtStats } from './processData';
import { CharaHpSpurtStats } from './types';
import UMDatabaseWrapper from '../../../../data/UMDatabaseWrapper';
import ReactECharts from 'echarts-for-react';
import CardNamePresenter from "../../../../components/CardNamePresenter";
import CharaProperLabels from "../../../../components/CharaProperLabels";
import { unknownCharaTag } from "../../../../components/RaceDataPresenter/utils/RacePresenterUtils";
import { createSyntheticReplayData } from './syntheticReplayUtils';
import { filterCharaSkills } from '../../../../data/RaceDataUtils';
import { computeOtherEvents } from '../../../../components/RaceReplay/utils/analysisUtils';
import RaceReplay from '../../../../components/RaceReplay';

interface Props {
    races: ParsedRace[];
}

interface BoxPlotStats {
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
}

const calculateBoxPlotStats = (data: number[]): BoxPlotStats | null => {
    if (data.length === 0) return null;
    const sorted = [...data].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    const getMedian = (arr: number[]) => {
        const mid = Math.floor(arr.length / 2);
        return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    };

    const median = getMedian(sorted);
    const midIndex = Math.floor(sorted.length / 2);
    const lowerHalf = sorted.slice(0, midIndex);
    const upperHalf = sorted.slice(sorted.length % 2 !== 0 ? midIndex + 1 : midIndex);

    const q1 = lowerHalf.length > 0 ? getMedian(lowerHalf) : min;
    const q3 = upperHalf.length > 0 ? getMedian(upperHalf) : max;

    return { min, q1, median, q3, max };
};

const getMeanMedian = (data: number[]) => {
    if (data.length === 0) return { mean: 0, median: 0 };
    const sum = data.reduce((acc, v) => acc + v, 0);
    const mean = sum / data.length;
    const sorted = [...data].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return { mean, median };
};

const HpSpurtAnalysisDetail: React.FC<{ stat: CharaHpSpurtStats }> = ({ stat }) => {
    const [showReplay, setShowReplay] = React.useState(false);
    const [replayReady, setReplayReady] = React.useState(false);
    const [replayData, setReplayData] = React.useState<{
        raceData: any;
        horseInfo: any;
        skillActivations: any;
        otherEvents: any;
        displayNames: any;
        trainerColors: any;
        detectedCourseId?: number;
    } | null>(null);

    const handleShowReplay = () => {
        if (replayData) {
            setShowReplay(true);
            return;
        }

        const { raceData, horseInfo, error, detectedCourseId } = createSyntheticReplayData(stat);

        if (error || !raceData) {
            alert(error || "Failed to generate replay data");
            return;
        }

        // Compute derived data properties for RaceReplay
        const skillActivations: Record<number, { time: number; name: string; param: number[] }[]> = {};
        const displayNames: Record<number, string> = {};
        const trainerColors: Record<number, string> = {};

        // 1. Skill Activations & Display Names & Colors
        for (let i = 0; i < (raceData.horseResult?.length || 0); i++) {
            const frameOrder = i;

            // Skill Activations
            const skills = filterCharaSkills(raceData, frameOrder).map(event => ({
                time: event.frameTime ?? 0,
                name: UMDatabaseWrapper.skillName(event.param[1]),
                param: event.param
            }));
            skillActivations[frameOrder] = skills;

            // Display Names
            displayNames[frameOrder] = `Run #${i + 1}`;

            // Trainer Colors (generate distinct colors)
            const hue = (i * 137.508) % 360; // Use golden angle approximation for distinctiveness
            trainerColors[frameOrder] = `hsl(${hue}, 70%, 50%)`;
        }

        // 2. Other Events
        // Use the first race's distance as reference (validRuns filtering ensures they are close)
        const raceDistance = stat.sourceRuns[0]?.race?.raceDistance || 2000;

        // Compute "Other Events" (Dueling/Struggle)
        // We pass the detected course ID from the first race
        const otherEvents = computeOtherEvents(raceData, horseInfo, detectedCourseId, skillActivations, raceDistance);

        setReplayData({
            raceData,
            horseInfo,
            skillActivations,
            otherEvents,
            displayNames,
            trainerColors,
            detectedCourseId
        });
        setShowReplay(true);
    };
    const fullSpurtTotal = stat.hpOutcomesFullSpurt.length;
    const fullSpurtSurvivors = stat.hpOutcomesFullSpurt.filter(hp => hp >= 0).length;
    const fullSpurtSurvivalRate = fullSpurtTotal > 0 ? (fullSpurtSurvivors / fullSpurtTotal) * 100 : 0;

    const nonFullSpurtTotal = stat.hpOutcomesNonFullSpurt.length;
    const nonFullSpurtSurvivors = stat.hpOutcomesNonFullSpurt.filter(hp => hp >= 0).length;
    const nonFullSpurtSurvivalRate = nonFullSpurtTotal > 0 ? (nonFullSpurtSurvivors / nonFullSpurtTotal) * 100 : 0;

    const fullSpurtBoxData = calculateBoxPlotStats(stat.hpOutcomesFullSpurt);
    const nonFullSpurtBoxData = calculateBoxPlotStats(stat.hpOutcomesNonFullSpurt);

    const getOption = () => {
        const data: number[][] = [];
        if (fullSpurtBoxData) data.push([
            fullSpurtBoxData.min,
            fullSpurtBoxData.q1,
            fullSpurtBoxData.median,
            fullSpurtBoxData.q3,
            fullSpurtBoxData.max
        ]);
        else data.push([]);

        if (nonFullSpurtBoxData) data.push([
            nonFullSpurtBoxData.min,
            nonFullSpurtBoxData.q1,
            nonFullSpurtBoxData.median,
            nonFullSpurtBoxData.q3,
            nonFullSpurtBoxData.max
        ]);
        else data.push([]);

        return {
            tooltip: {
                trigger: 'item',
                axisPointer: { type: 'shadow' }
            },
            grid: {
                left: '10%',
                right: '10%',
                bottom: '15%'
            },
            xAxis: {
                type: 'category',
                data: ['Full Spurt check passed', 'Full Spurt check failed'],
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisLabel: { color: '#e2e8f0' }
            },
            yAxis: {
                type: 'value',
                name: 'Final HP (Deficit if negative)',
                nameTextStyle: { color: '#e2e8f0' },
                axisLine: { lineStyle: { color: '#e2e8f0' } },
                axisLabel: { color: '#e2e8f0' },
                splitLine: { lineStyle: { color: '#4a5568' } }
            },
            series: [{
                name: 'HP Distribution',
                type: 'boxplot',
                data: data,
                itemStyle: {
                    color: '#6366f1',
                    borderColor: '#a5b4fc'
                }
            }]
        };
    };

    return (
        <div style={{ padding: '20px', background: '#2d3748', borderRadius: '8px' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 style={{ color: "#e2e8f0", marginBottom: 0 }}>Analysis Detail</h5>
                <Button variant="primary" size="sm" onClick={handleShowReplay}>
                    View Aggregate Replay
                </Button>
            </div>

            <div className="d-flex flex-row align-items-start mb-4">
                <Table size="small" className="w-auto m-2 text-white">
                    <thead>
                        <tr>
                            <th>Skill</th>
                            <th>Level</th>
                            <th>Activations</th>
                            <th>Normalized</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stat.trainedChara.skills.map((cs, idx) => {
                            const count = stat.skillActivationCounts?.[cs.skillId] || 0;
                            const rate = stat.totalRuns > 0 ? (count / stat.totalRuns * 100) : 0;

                            const normCount = stat.normalizedSkillActivationCounts?.[cs.skillId] || 0;
                            // For normalized, we compare it against totalRuns as expected
                            const normRate = stat.totalRuns > 0 ? (normCount / stat.totalRuns * 100) : 0;

                            return (
                                <tr key={`${cs.skillId}-${idx}`}>
                                    <td>{UMDatabaseWrapper.skillNameWithId(cs.skillId)}</td>
                                    <td>Lv {cs.level}</td>
                                    <td>
                                        <span style={{ fontWeight: 'bold', color: rate > 50 ? '#4ade80' : '#e2e8f0' }}>{rate.toFixed(1)}%</span>
                                        <span className="text-muted" style={{ marginLeft: '8px', fontSize: '0.9em' }}>({count}/{stat.totalRuns})</span>
                                    </td>
                                    <td>
                                        <span style={{ fontWeight: 'bold', color: normRate > 50 ? '#4ade80' : '#e2e8f0' }}>{normRate.toFixed(1)}%</span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </Table>
                <CharaProperLabels chara={stat.trainedChara} />
            </div>

            <Table striped bordered hover variant="dark" size="sm" responsive>
                <thead>
                    <tr>
                        <th>Condition</th>
                        <th className="text-center">Count</th>
                        <th className="text-center">Survival Rate</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Full Spurt check passed</td>
                        <td className="text-center">{fullSpurtTotal}</td>
                        <td className="text-center">
                            <span style={{
                                color: fullSpurtSurvivalRate > 80 ? '#4ade80' : fullSpurtSurvivalRate > 50 ? '#facc15' : '#f87171',
                                fontWeight: 'bold'
                            }}>
                                {fullSpurtSurvivalRate.toFixed(1)}%
                            </span>
                        </td>
                    </tr>
                    <tr>
                        <td>Full Spurt check failed</td>
                        <td className="text-center">{nonFullSpurtTotal}</td>
                        <td className="text-center">
                            <span style={{
                                color: nonFullSpurtSurvivalRate > 80 ? '#4ade80' : nonFullSpurtSurvivalRate > 50 ? '#facc15' : '#f87171',
                                fontWeight: 'bold'
                            }}>
                                {nonFullSpurtSurvivalRate.toFixed(1)}%
                            </span>
                        </td>
                    </tr>
                </tbody>
            </Table>

            <div style={{ height: '400px', marginTop: '20px', background: '#1a202c', padding: '10px', borderRadius: '8px' }}>
                {/* @ts-ignore */}
                <ReactECharts option={getOption()} style={{ height: '100%', width: '100%' }} theme="dark" />
            </div>

            {stat.recoveryStats && Object.keys(stat.recoveryStats).length > 0 && (
                <div style={{ marginTop: '30px' }}>
                    <h5 style={{ color: '#e2e8f0', marginBottom: '15px' }}>Recovery Skill Analysis</h5>
                    <Table striped bordered hover variant="dark" size="sm" responsive>
                        <thead>
                            <tr>
                                <th>Configuration (Value - Activated/Total)</th>
                                <th className="text-center">Count</th>
                                <th className="text-center">Full Spurt Rate</th>
                                <th className="text-center">Survival Rate</th>
                                <th className="text-center">Mean HP</th>
                                <th className="text-center">Median HP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.values(stat.recoveryStats)
                                .sort((a, b) => b.totalRuns - a.totalRuns)
                                .map(row => {
                                    const fsRate = (row.fullSpurtCount / row.totalRuns) * 100;
                                    const sRate = (row.survivalCount / row.totalRuns) * 100;
                                    const { mean, median } = getMeanMedian(row.hpOutcomes);
                                    return (
                                        <tr key={row.scenarioId}>
                                            <td>{row.label}</td>
                                            <td className="text-center">{row.totalRuns}</td>
                                            <td className="text-center">
                                                <span style={{
                                                    color: fsRate > 80 ? '#4ade80' : fsRate > 50 ? '#facc15' : '#f87171',
                                                    fontWeight: 'bold'
                                                }}>
                                                    {fsRate.toFixed(1)}% <span className="text-muted" style={{ fontWeight: 'normal', fontSize: '0.9em' }}>({row.fullSpurtCount})</span>
                                                </span>
                                            </td>
                                            <td className="text-center">
                                                <span style={{
                                                    color: sRate > 80 ? '#4ade80' : sRate > 50 ? '#facc15' : '#f87171',
                                                    fontWeight: 'bold'
                                                }}>
                                                    {sRate.toFixed(1)}% <span className="text-muted" style={{ fontWeight: 'normal', fontSize: '0.9em' }}>({row.survivalCount})</span>
                                                </span>
                                            </td>
                                            <td className="text-center">{mean.toFixed(1)}</td>
                                            <td className="text-center">{median.toFixed(1)}</td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </Table>
                </div>
            )}

            <Modal show={showReplay} onHide={() => { setShowReplay(false); setReplayReady(false); }} onEntered={() => setReplayReady(true)} size="xl" centered dialogClassName="modal-90w">
                <Modal.Header closeButton className="bg-dark text-white">
                    <Modal.Title>Aggregate Replay</Modal.Title>
                </Modal.Header>
                <Modal.Body className="bg-dark">
                    {replayData && replayReady && (
                        <RaceReplay
                            raceData={replayData.raceData}
                            raceHorseInfo={replayData.horseInfo}
                            skillActivations={replayData.skillActivations}
                            otherEvents={replayData.otherEvents}
                            displayNames={replayData.displayNames}
                            trainerColors={replayData.trainerColors}
                            detectedCourseId={replayData.detectedCourseId}
                            infoTitle="Aggregate Replay Info"
                            infoContent={<>Replay of all runs for this character configuration.</>}
                        />
                    )}
                </Modal.Body>
            </Modal>
        </div>
    );
};

export const HpSpurtAnalysis: React.FC<Props> = ({ races }) => {

    // Compute stats for all player characters, grouped by unique stats configuration
    const stats: CharaHpSpurtStats[] = useMemo(() => {
        return computeHpSpurtStats(races, undefined, true, undefined, true);
    }, [races]);

    const columns: ColumnDescription<CharaHpSpurtStats>[] = [
        {
            dataField: 'chara',
            text: 'Character',
            formatter: (cell, row) => {
                const charaData = UMDatabaseWrapper.charas[row.charaId];
                const cardName = UMDatabaseWrapper.cards[row.cardId]?.name;
                return charaData ? <>
                    {charaData.name} {row.trainedChara.viewerName ? `[${row.trainedChara.viewerName}]` : ''}
                    {cardName ? <span className="text-muted" style={{ marginLeft: '4px' }}>({cardName})</span> : <CardNamePresenter cardId={row.cardId} />}
                </> : unknownCharaTag;
            },
            sort: true,
            sortValue: (cell, row) => row.charaName
        },
        {
            dataField: 'trainedChara.rankScore',
            text: 'Score',
            sort: true
        },
        {
            dataField: 'wins',
            isDummyField: true,
            text: 'Win Rate',
            formatter: (cell, row) => {
                const rate = row.totalRuns > 0 ? (row.wins / row.totalRuns) * 100 : 0;
                return (
                    <span style={{
                        fontWeight: 'bold',
                        color: rate > 50 ? '#4ade80' : rate > 20 ? '#facc15' : '#e2e8f0' // Green if >50, Yellow >20
                    }}>
                        {rate.toFixed(1)}% <span className="text-muted" style={{ fontWeight: 'normal', fontSize: '0.9em' }}>({row.wins})</span>
                    </span>
                );
            },
            sort: true,
            sortValue: (cell, row) => row.totalRuns > 0 ? (row.wins / row.totalRuns) : 0
        },
        {
            dataField: 'top3',
            isDummyField: true,
            text: 'Top 3 %',
            formatter: (cell, row) => {
                const rate = row.totalRuns > 0 ? (row.top3Finishes / row.totalRuns) * 100 : 0;
                return (
                    <span style={{
                        fontWeight: 'bold',
                        color: rate > 80 ? '#4ade80' : rate > 50 ? '#facc15' : '#e2e8f0'
                    }}>
                        {rate.toFixed(1)}% <span className="text-muted" style={{ fontWeight: 'normal', fontSize: '0.9em' }}>({row.top3Finishes})</span>
                    </span>
                );
            },
            sort: true,
            sortValue: (cell, row) => row.totalRuns > 0 ? (row.top3Finishes / row.totalRuns) : 0
        },
        {
            dataField: 'totalRuns',
            text: 'Runs',
            sort: true,
            headerClasses: 'text-center',
            classes: 'text-center'
        },
        {
            dataField: 'fullSpurtRate',
            isDummyField: true,
            text: 'Full Spurt Rate',
            formatter: (cell, row) => {
                const rate = row.totalRuns > 0 ? (row.fullSpurtCount / row.totalRuns) * 100 : 0;
                return (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ flexGrow: 1, marginRight: '8px' }}>
                            <ProgressBar
                                now={rate}
                                variant={rate > 80 ? 'success' : rate > 50 ? 'warning' : 'danger'}
                                style={{ height: '8px' }}
                            />
                        </div>
                        <span style={{ minWidth: '45px', textAlign: 'right', fontWeight: 'bold' }}>{rate.toFixed(1)}%</span>
                    </div>
                );
            },
            sort: true,
            sortValue: (cell, row) => row.totalRuns > 0 ? (row.fullSpurtCount / row.totalRuns) * 100 : 0
        },
        {
            dataField: 'survivalRate',
            isDummyField: true,
            text: 'Survival Rate',
            formatter: (cell, row) => {
                const rate = row.totalRuns > 0 ? (row.survivalCount / row.totalRuns) * 100 : 0;
                return (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ flexGrow: 1, marginRight: '8px' }}>
                            <ProgressBar
                                now={rate}
                                variant={rate > 95 ? 'success' : rate > 80 ? 'warning' : 'danger'}
                                style={{ height: '8px' }}
                            />
                        </div>
                        <span style={{ minWidth: '45px', textAlign: 'right', fontWeight: 'bold' }}>{rate.toFixed(1)}%</span>
                    </div>
                );
            },
            sort: true,
            sortValue: (cell, row) => row.totalRuns > 0 ? (row.survivalCount / row.totalRuns) * 100 : 0
        }
    ];

    const expandRow: ExpandRowProps<CharaHpSpurtStats> = {
        renderer: row => <HpSpurtAnalysisDetail stat={row} />,
        showExpandColumn: true,
        expandByColumnOnly: true
    };

    return (
        <div style={{ background: '#1a202c', padding: '15px', borderRadius: '8px' }}>
            {stats.length === 0 ? (
                <div className="text-center text-muted p-4">
                    No user characters found in the loaded races.
                </div>
            ) : (
                <BootstrapTable
                    bootstrap4
                    condensed
                    hover
                    keyField="uniqueId"
                    data={stats}
                    columns={columns}
                    expandRow={expandRow}
                    classes="table-dark"
                    wrapperClasses="table-responsive"
                    headerClasses="text-white"
                />
            )}
        </div>
    );
};

export default HpSpurtAnalysis;
