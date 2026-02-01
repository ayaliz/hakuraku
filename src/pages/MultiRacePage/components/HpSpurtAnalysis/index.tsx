import React, { useMemo } from 'react';
import { Table, ProgressBar } from 'react-bootstrap';
import BootstrapTable, { ColumnDescription, ExpandRowProps } from "react-bootstrap-table-next";
import 'react-bootstrap-table-next/dist/react-bootstrap-table2.min.css';


import { ParsedRace } from '../../types';
import { computeHpSpurtStats } from './processData';
import { CharaHpSpurtStats } from './types';
import UMDatabaseWrapper from '../../../../data/UMDatabaseWrapper';
import './HpSpurtAnalysis.css';
import HpDistributionModal from './HpDistributionModal';

import CardNamePresenter from "../../../../components/CardNamePresenter";
import CharaProperLabels from "../../../../components/CharaProperLabels";
import { unknownCharaTag } from "../../../../components/RaceDataPresenter/utils/RacePresenterUtils";

import speedIcon from "../../../../data/textures/speed.png";
import staminaIcon from "../../../../data/textures/stamina.png";
import powerIcon from "../../../../data/textures/power.png";
import gutsIcon from "../../../../data/textures/guts.png";
import witIcon from "../../../../data/textures/wit.png";

interface Props {
    races: ParsedRace[];
}



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
    // 1. Calculate Aggregates
    const fullSpurtRate = stat.totalRuns > 0 ? (stat.hpOutcomesFullSpurt.length / stat.totalRuns) * 100 : 0;
    const survivalRate = stat.totalRuns > 0 ? (stat.survivalCount / stat.totalRuns) * 100 : 0;

    const allHpOutcomes = [...stat.hpOutcomesFullSpurt, ...stat.hpOutcomesNonFullSpurt];
    const { mean: meanHp, median: medianHp } = getMeanMedian(allHpOutcomes);

    // Modal State
    const [modalOpen, setModalOpen] = React.useState(false);
    const [modalTitle, setModalTitle] = React.useState('');
    const [modalData, setModalData] = React.useState<number[]>([]);

    const openModal = (title: string, data: number[]) => {
        setModalTitle(title);
        setModalData(data);
        setModalOpen(true);
    };


    const getRateColor = (rate: number, type: 'good' | 'bad' = 'good') => {
        if (type === 'good') return rate > 80 ? '#4ade80' : rate > 50 ? '#facc15' : '#f87171';
        return rate < 20 ? '#4ade80' : rate < 50 ? '#facc15' : '#f87171';
    };

    const getProgVariant = (rate: number) => rate > 80 ? 'success' : rate > 50 ? 'warning' : 'danger';


    const StatCard = ({ title, value, subValue, progress, variant }: { title: string, value: React.ReactNode, subValue?: string, progress?: number, variant?: string }) => (
        <div className="stat-card" style={{ padding: '15px', borderRadius: '8px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ color: '#a0aec0', fontSize: '0.85em', textTransform: 'uppercase', marginBottom: '5px', fontWeight: 600 }}>{title}</div>
            <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#e2e8f0' }}>{value}</div>
            {subValue && <div style={{ color: '#718096', fontSize: '0.9em' }}>{subValue}</div>}
            {progress !== undefined && (
                <div style={{ marginTop: '10px' }}>
                    <ProgressBar now={progress} variant={variant || getProgVariant(progress)} style={{ height: '6px', backgroundColor: '#4a5568' }} />
                </div>
            )}
        </div>
    );

    const iconStyle: React.CSSProperties = { width: 16, height: 16, marginRight: 2, verticalAlign: 'middle' };
    const statStyle: React.CSSProperties = { marginRight: 12, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', color: '#e2e8f0', fontSize: '0.9em' };

    return (
        <div className="analysis-detail-container">
            <HpDistributionModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={modalTitle}
                data={modalData}
            />


            <div className="d-flex justify-content-between align-items-start mb-4">
                <div className="d-flex align-items-center">
                    <CharaProperLabels chara={stat.trainedChara} />
                    <div style={{ marginLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex' }}>
                            <span style={statStyle} title="Speed"><img src={speedIcon} alt="Speed" style={iconStyle} />{stat.stats.speed}</span>
                            <span style={statStyle} title="Stamina"><img src={staminaIcon} alt="Stamina" style={iconStyle} />{stat.stats.stamina}</span>
                            <span style={statStyle} title="Power"><img src={powerIcon} alt="Power" style={iconStyle} />{stat.stats.pow}</span>
                            <span style={statStyle} title="Guts"><img src={gutsIcon} alt="Guts" style={iconStyle} />{stat.stats.guts}</span>
                            <span style={statStyle} title="Wisdom"><img src={witIcon} alt="Wisdom" style={iconStyle} />{stat.stats.wiz}</span>
                        </div>
                    </div>
                </div>
            </div>


            <div className="row mb-4">
                <div className="col-md-3 col-6 mb-3 mb-md-0">
                    <div onClick={() => openModal('All Runs', allHpOutcomes)} style={{ cursor: 'pointer' }}>
                        <StatCard
                            title="Total Runs"
                            value={stat.totalRuns}
                            subValue={`Win Rate: ${((stat.wins / stat.totalRuns) * 100).toFixed(1)}%`}
                        />
                    </div>
                </div>
                <div className="col-md-3 col-6 mb-3 mb-md-0">
                    <div onClick={() => openModal('Full Spurt Runs', stat.hpOutcomesFullSpurt)} style={{ cursor: 'pointer' }}>
                        <StatCard
                            title="Full Spurt Rate"
                            value={`${fullSpurtRate.toFixed(1)}%`}
                            subValue={`${stat.hpOutcomesFullSpurt.length} / ${stat.totalRuns}`}
                            progress={fullSpurtRate}
                        />
                    </div>
                </div>
                <div className="col-md-3 col-6">
                    <div onClick={() => openModal('Survivor Runs', allHpOutcomes.filter(h => h > 0))} style={{ cursor: 'pointer' }}>
                        <StatCard
                            title="Survival Rate"
                            value={`${survivalRate.toFixed(1)}%`}
                            subValue={`${stat.survivalCount} / ${stat.totalRuns}`}
                            progress={survivalRate}
                        />
                    </div>
                </div>
                <div className="col-md-3 col-6">
                    <StatCard
                        title="Avg Final HP"
                        value={<span style={{ color: meanHp >= 0 ? '#4ade80' : '#f87171' }}>{meanHp > 0 ? '+' : ''}{meanHp.toFixed(0)}</span>}
                        subValue={`Median: ${medianHp.toFixed(0)}`}
                        variant={meanHp >= 0 ? 'success' : 'danger'}
                        progress={Math.min(Math.abs(meanHp) / 200 * 100, 100)}
                    />
                </div>
            </div>

            {stat.recoveryStats && Object.keys(stat.recoveryStats).length > 0 ? (
                <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ padding: '15px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(30, 41, 59, 0.6)' }}>
                        <h5 style={{ margin: 0, color: '#e2e8f0', fontSize: '1rem' }}>Recovery Skill Analysis</h5>
                    </div>
                    <Table className="mb-0 detail-table" size="sm" responsive>
                        <thead>
                            <tr>
                                <th style={{ borderTop: 0 }}>
                                    Recovery Scenario
                                    <div style={{ fontSize: '0.75em', color: '#a0aec0', fontWeight: 'normal', marginTop: '2px' }}>
                                        Heal % (Active / Total)
                                    </div>
                                </th>
                                <th className="text-center" style={{ borderTop: 0, width: '100px', verticalAlign: 'middle' }}>Runs</th>
                                <th className="text-center" style={{ borderTop: 0, width: '120px', verticalAlign: 'middle' }}>Full Spurt</th>
                                <th className="text-center" style={{ borderTop: 0, width: '120px', verticalAlign: 'middle' }}>Survival</th>
                                <th className="text-center" style={{ borderTop: 0, width: '100px', verticalAlign: 'middle' }}>Mean HP</th>
                                <th className="text-center" style={{ borderTop: 0, width: '100px', verticalAlign: 'middle' }}>Median HP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.values(stat.recoveryStats)
                                .sort((a, b) => b.totalRuns - a.totalRuns)
                                .map(row => {
                                    const fsRate = (row.fullSpurtCount / row.totalRuns) * 100;
                                    const sRate = (row.survivalCount / row.totalRuns) * 100;
                                    const { mean, median } = getMeanMedian(row.hpOutcomes);

                                    // Row share calculation
                                    const shareMap = (row.totalRuns / stat.totalRuns) * 100;

                                    return (
                                        <tr key={row.scenarioId}>
                                            <td
                                                style={{ verticalAlign: 'middle', cursor: 'pointer' }}
                                                onClick={() => openModal(`${row.label} - All Runs`, row.hpOutcomes)}
                                                className="clickable-cell"
                                            >
                                                <div style={{ fontWeight: 'bold', color: '#e2e8f0', textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: '#6366f1' }}>
                                                    {row.label}
                                                </div>
                                                <div style={{ height: '2px', width: `${shareMap}%`, background: '#6366f1', marginTop: '4px', opacity: 0.5 }}></div>
                                            </td>
                                            <td className="text-center" style={{ verticalAlign: 'middle' }}>
                                                <div style={{ fontWeight: 'bold' }}>{row.totalRuns}</div>
                                                <div style={{ fontSize: '0.8em', color: '#718096' }}>{shareMap.toFixed(1)}%</div>
                                            </td>
                                            <td
                                                className="text-center clickable-cell"
                                                style={{ verticalAlign: 'middle', cursor: 'pointer' }}
                                                onClick={() => openModal(`${row.label} - Full Spurt Runs`, row.hpOutcomesFullSpurt)}
                                            >
                                                <span style={{
                                                    color: getRateColor(fsRate),
                                                    fontWeight: 'bold',
                                                    textDecoration: 'underline', textDecorationStyle: 'dotted'
                                                }}>
                                                    {fsRate.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td
                                                className="text-center clickable-cell"
                                                style={{ verticalAlign: 'middle', cursor: 'pointer' }}
                                                onClick={() => openModal(`${row.label} - Survivor Runs`, row.hpOutcomes.filter(h => h > 0))}
                                            >
                                                <span style={{
                                                    color: getRateColor(sRate),
                                                    fontWeight: 'bold',
                                                    textDecoration: 'underline', textDecorationStyle: 'dotted'
                                                }}>
                                                    {sRate.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td className="text-center" style={{ verticalAlign: 'middle' }}>
                                                <span style={{ color: mean >= 0 ? '#4ade80' : '#f87171' }}>{mean.toFixed(0)}</span>
                                            </td>
                                            <td className="text-center" style={{ verticalAlign: 'middle' }}>
                                                <span style={{ color: median >= 0 ? '#4ade80' : '#f87171' }}>{median.toFixed(0)}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </Table>
                </div>
            ) : (
                <div className="text-muted text-center p-4" style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '8px', marginBottom: '20px' }}>
                    No recovery skills found or analyzed.
                </div>
            )
            }


            <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(30, 41, 59, 0.6)' }}>
                    <h5 style={{ margin: 0, color: '#e2e8f0', fontSize: '1rem' }}>Skill Activations</h5>
                </div>
                <Table className="mb-0 detail-table" size="sm" responsive>
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
            </div>
        </div >
    );
};

export const HpSpurtAnalysis: React.FC<Props> = ({ races }) => {

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
                return charaData ? (
                    <div>
                        <div style={{ fontWeight: 600 }}>{charaData.name}</div>
                        <div className="text-muted" style={{ fontSize: '0.85em' }}>
                            {cardName || <CardNamePresenter cardId={row.cardId} />}
                        </div>
                    </div>
                ) : unknownCharaTag;
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
                        color: rate > 50 ? '#4ade80' : rate > 20 ? '#facc15' : '#e2e8f0'
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
                const rate = row.totalRuns > 0 ? (row.hpOutcomesFullSpurt.length / row.totalRuns) * 100 : 0;
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
            sortValue: (cell, row) => row.totalRuns > 0 ? (row.hpOutcomesFullSpurt.length / row.totalRuns) * 100 : 0
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
                                variant={rate > 80 ? 'success' : rate > 50 ? 'warning' : 'danger'}
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
        <div className="hp-analysis-wrapper">
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
                    classes="hp-analysis-table"
                    wrapperClasses="table-responsive"
                />
            )}
        </div>
    );
};

export default HpSpurtAnalysis;
