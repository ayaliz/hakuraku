import React, { useMemo } from 'react';
import { Table, ProgressBar } from 'react-bootstrap';
import { CharaHpSpurtStats } from './types';
import UMDatabaseWrapper from '../../../../data/UMDatabaseWrapper';
import './HpSpurtAnalysis.css';
import HpDistributionModal from './HpDistributionModal';
import CharaProperLabels from "../../../../components/CharaProperLabels";
import { getCourseAptitudeFilters } from "../../utils";

const getMeanMedian = (data: number[]) => {
    if (data.length === 0) return { mean: 0, median: 0 };
    const sum = data.reduce((acc, v) => acc + v, 0);
    const mean = sum / data.length;
    const sorted = [...data].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return { mean, median };
};

const HpSpurtAnalysisDetail: React.FC<{ stat: CharaHpSpurtStats; courseId?: number }> = ({ stat, courseId }) => {
    const aptitudeFilters = getCourseAptitudeFilters(courseId);

    const dominantRunningStyle = useMemo(() => {
        const counts: Record<number, number> = {};
        stat.sourceRuns.forEach(({ race, horseFrameOrder }) => {
            const horseData = race.horseInfo.find(
                (h, idx) => ((h['frame_order'] ?? (idx + 1)) - 1) === horseFrameOrder
            );
            const raw = horseData?.running_style;
            const style = (raw === 1 || raw === 2 || raw === 3 || raw === 4) ? raw : 1;
            counts[style] = (counts[style] ?? 0) + 1;
        });
        let best = 1, bestCount = 0;
        for (const [s, c] of Object.entries(counts)) {
            if (c > bestCount) { bestCount = c; best = Number(s); }
        }
        return best;
    }, [stat.sourceRuns]);
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
        <div className="stat-card detail-stat-card">
            <div className="dsc-title">{title}</div>
            <div className="dsc-value">{value}</div>
            {subValue && <div className="dsc-subvalue">{subValue}</div>}
            {progress !== undefined && (
                <div className="dsc-progress">
                    <ProgressBar now={progress} variant={variant || getProgVariant(progress)} />
                </div>
            )}
        </div>
    );

    return (
        <div className="analysis-detail-container">
            <HpDistributionModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={modalTitle}
                data={modalData}
            />


            <div className="detail-top-section">
                <CharaProperLabels
                    chara={stat.trainedChara}
                    groundFilter={aptitudeFilters?.ground}
                    distanceFilter={aptitudeFilters?.distance}
                    runningStyleFilter={dominantRunningStyle}
                />
                <div className="detail-stat-cards">
                    <div className="detail-stat-card-clickable" onClick={() => openModal('All Runs', allHpOutcomes)}>
                        <StatCard
                            title="Total Runs"
                            value={stat.totalRuns}
                            subValue={`Win Rate: ${((stat.wins / stat.totalRuns) * 100).toFixed(1)}%`}
                        />
                    </div>
                    <div className="detail-stat-card-clickable" onClick={() => openModal('Full Spurt Runs', stat.hpOutcomesFullSpurt)}>
                        <StatCard
                            title="Full Spurt Rate"
                            value={`${fullSpurtRate.toFixed(1)}%`}
                            subValue={`${stat.hpOutcomesFullSpurt.length} / ${stat.totalRuns}`}
                            progress={fullSpurtRate}
                        />
                    </div>
                    <div className="detail-stat-card-clickable" onClick={() => openModal('Survivor Runs', allHpOutcomes.filter(h => h > 0))}>
                        <StatCard
                            title="Survival Rate"
                            value={`${survivalRate.toFixed(1)}%`}
                            subValue={`${stat.survivalCount} / ${stat.totalRuns}`}
                            progress={survivalRate}
                        />
                    </div>
                    <div>
                        <StatCard
                            title="Avg Final HP"
                            value={<span style={{ color: meanHp >= 0 ? '#4ade80' : '#f87171' }}>{meanHp > 0 ? '+' : ''}{meanHp.toFixed(0)}</span>}
                            subValue={`Median: ${medianHp.toFixed(0)}`}
                            variant={meanHp >= 0 ? 'success' : 'danger'}
                            progress={Math.min(Math.abs(meanHp) / 200 * 100, 100)}
                        />
                    </div>
                </div>
            </div>

            {stat.recoveryStats && Object.keys(stat.recoveryStats).length > 0 && (
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
            )}


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

export default HpSpurtAnalysisDetail;
