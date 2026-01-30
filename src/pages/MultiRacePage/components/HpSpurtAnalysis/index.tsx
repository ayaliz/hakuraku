import React, { useMemo, useState, useEffect } from 'react';
import { Table, ProgressBar, Form, Alert } from 'react-bootstrap';
import { ParsedRace } from '../../types';
import { computeHpSpurtStats } from './processData';
import { CharaHpSpurtStats } from './types';
import { fromRaceHorseData } from '../../../../data/TrainedCharaData';
import UMDatabaseWrapper from '../../../../data/UMDatabaseWrapper';
import ReactECharts from 'echarts-for-react';

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

interface CharacterOption {
    id: string; // Unique ID (hash of charaId + stats)
    charaId: number;
    name: string;
    stats: { speed: number, stamina: number, pow: number, guts: number, wiz: number };
}

export const HpSpurtAnalysis: React.FC<Props> = ({ races }) => {
    // 1. Identify all unique User Characters available in the races
    const userCharacters = useMemo(() => {
        const charaMap = new Map<string, CharacterOption>();
        races.forEach(race => {
            race.horseInfo.forEach((data, index) => {
                const frameOrder = (data['frame_order'] ?? data.frameOrder ?? (index + 1)) - 1;
                // Check if this horse is a player horse
                if (race.playerIndices?.has(frameOrder)) {
                    const trainedChara = fromRaceHorseData(data);
                    const charaId = trainedChara.charaId;

                    const uniqueId = `${charaId}_${trainedChara.speed}_${trainedChara.stamina}_${trainedChara.pow}_${trainedChara.guts}_${trainedChara.wiz}`;

                    if (!charaMap.has(uniqueId)) {
                        const baseName = UMDatabaseWrapper.charas[charaId]?.name ?? `Unknown (${charaId})`;
                        const statsStr = `(${trainedChara.speed}/${trainedChara.stamina}/${trainedChara.pow}/${trainedChara.guts}/${trainedChara.wiz})`;
                        charaMap.set(uniqueId, {
                            id: uniqueId,
                            charaId,
                            name: `${baseName} ${statsStr}`,
                            stats: {
                                speed: trainedChara.speed,
                                stamina: trainedChara.stamina,
                                pow: trainedChara.pow,
                                guts: trainedChara.guts,
                                wiz: trainedChara.wiz
                            }
                        });
                    }
                }
            });
        });
        return Array.from(charaMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [races]);

    // State for selected character (using filtered unique string ID)
    const [selectedUniqueId, setSelectedUniqueId] = useState<string | undefined>(undefined);

    // Auto-select if only one character exists or on first load if list is non-empty
    useEffect(() => {
        if (!selectedUniqueId && userCharacters.length > 0) {
            setSelectedUniqueId(userCharacters[0].id);
        }
    }, [userCharacters, selectedUniqueId]);

    // 2. Compute stats ONLY for the selected character (and filtered by isPlayer=true inside processData)
    const stats: CharaHpSpurtStats[] = useMemo(() => {
        if (!selectedUniqueId) return [];
        const selectedOption = userCharacters.find(c => c.id === selectedUniqueId);
        if (!selectedOption) return [];
        return computeHpSpurtStats(races, selectedOption.charaId, true, selectedOption.stats);
    }, [races, selectedUniqueId, userCharacters]);

    // 3. Render Detailed Analysis (Single Character)
    const renderAnalysis = () => {
        if (!selectedUniqueId || stats.length === 0) return null;
        const stat = stats[0]; // Should only be one

        // Calculate conditional Survival Rates
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
            // ECharts boxplot format: [min, Q1, median, Q3, max]
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
                series: [
                    {
                        name: 'HP Distribution',
                        type: 'boxplot',
                        data: data,
                        itemStyle: {
                            color: '#6366f1',
                            borderColor: '#a5b4fc'
                        }
                    }
                ]
            };
        };

        return (
            <div style={{ marginTop: '20px' }}>
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

                <div style={{ height: '400px', marginTop: '20px', background: '#2d3748', padding: '10px', borderRadius: '8px' }}>
                    <ReactECharts option={getOption()} style={{ height: '100%', width: '100%' }} theme="dark" />
                </div>
            </div>
        );
    };

    return (
        <div style={{ background: '#1a202c', padding: '15px', borderRadius: '8px' }}>
            <Form.Group style={{ marginBottom: '15px' }}>
                <Form.Label style={{ color: '#e2e8f0' }}>Select Character</Form.Label>
                <Form.Control
                    as="select"
                    value={selectedUniqueId ?? ''}
                    onChange={(e) => setSelectedUniqueId(e.target.value)}
                    style={{ background: '#2d3748', color: '#e2e8f0', border: '1px solid #4a5568' }}
                >
                    {userCharacters.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                    {userCharacters.length === 0 && <option value="">No user characters found</option>}
                </Form.Control>
            </Form.Group>

            {userCharacters.length === 0 ? (
                <Alert variant="warning">No user characters identified in the uploaded races.</Alert>
            ) : (
                <>
                    {/* General Stats Summary for Selected Character */}
                    {stats.length > 0 && (
                        <Table striped bordered hover variant="dark" size="sm" responsive>
                            <thead>
                                <tr>
                                    <th style={{ width: '25%' }}>Character</th>
                                    <th className="text-center" style={{ width: '10%' }}>Runs</th>
                                    <th className="text-center" style={{ width: '32.5%' }}>Full Spurt Rate</th>
                                    <th className="text-center" style={{ width: '32.5%' }}>Overall Survival Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.map(stat => {
                                    const spurtPct = stat.totalRuns > 0 ? (stat.fullSpurtCount / stat.totalRuns) * 100 : 0;
                                    const survPct = stat.totalRuns > 0 ? (stat.survivalCount / stat.totalRuns) * 100 : 0;
                                    return (
                                        <tr key={stat.charaId}>
                                            <td style={{ verticalAlign: 'middle' }}>{stat.charaName}</td>
                                            <td className="text-center" style={{ verticalAlign: 'middle' }}>{stat.totalRuns}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                    <div style={{ flexGrow: 1, marginRight: '8px' }}>
                                                        <ProgressBar
                                                            now={spurtPct}
                                                            variant={spurtPct > 80 ? 'success' : spurtPct > 50 ? 'warning' : 'danger'}
                                                            style={{ height: '8px' }}
                                                        />
                                                    </div>
                                                    <span style={{ minWidth: '45px', textAlign: 'right', fontWeight: 'bold' }}>{spurtPct.toFixed(1)}%</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                    <div style={{ flexGrow: 1, marginRight: '8px' }}>
                                                        <ProgressBar
                                                            now={survPct}
                                                            variant={survPct > 95 ? 'success' : survPct > 80 ? 'warning' : 'danger'}
                                                            style={{ height: '8px' }}
                                                        />
                                                    </div>
                                                    <span style={{ minWidth: '45px', textAlign: 'right', fontWeight: 'bold' }}>{survPct.toFixed(1)}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </Table>
                    )}

                    {renderAnalysis()}

                    {stats.length === 0 && selectedUniqueId && (
                        <div className="text-center text-muted" style={{ padding: '20px' }}>
                            No runs found for this character in the current filter.
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default HpSpurtAnalysis;
