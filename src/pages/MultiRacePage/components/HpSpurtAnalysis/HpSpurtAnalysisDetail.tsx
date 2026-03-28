import React from 'react';
import { Table } from 'react-bootstrap';
import { CharaHpSpurtStats, RecoveryScenarioStats } from './types';
import UMDatabaseWrapper from '../../../../data/UMDatabaseWrapper';
import './HpSpurtAnalysis.css';
import HpDistributionModal from './HpDistributionModal';
import { getColorForSpurtDelay } from "../../../../components/RaceDataPresenter/utils/RacePresenterUtils";

const getMeanMedian = (data: number[]) => {
    if (data.length === 0) return { mean: 0, median: 0 };
    const sum = data.reduce((acc, v) => acc + v, 0);
    const mean = sum / data.length;
    const sorted = [...data].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return { mean, median };
};

const formatMetric = (value: number, digits: number, signed: boolean = false): string => {
    const prefix = signed && value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(digits)}`;
};

const getRateColor = (rate: number) => (
    rate > 80 ? '#4ade80' : rate > 50 ? '#facc15' : '#f87171'
);

const getSignedMetricColor = (value: number) => (
    value >= 0 ? '#4ade80' : '#f87171'
);

const getSpeedDiffColor = (value: number) => {
    if (value >= -0.05) return '#4ade80';
    if (value >= -0.2) return '#facc15';
    return '#f87171';
};

const AvgHeader: React.FC<{ label: string }> = ({ label }) => (
    <>
        <div>Avg</div>
        <div className="hp-th-subtitle hp-th-subtitle--avg">{label}</div>
    </>
);

type RecoveryScenarioPart = {
    pctLabel: string;
    activatedCount: number;
    lateCount: number;
};

function parseRecoveryScenarioParts(scenarioId: string): RecoveryScenarioPart[] {
    return scenarioId.split('_').flatMap((part) => {
        const match = part.match(/^(\d+)-e(\d+)-l(\d+)\/(\d+)$/);
        if (!match) return [];

        const [, rawValue, rawEarlyCount, rawLateCount] = match;
        const earlyCount = Number(rawEarlyCount);
        const lateCount = Number(rawLateCount);
        const activatedCount = earlyCount + lateCount;

        if (activatedCount === 0) return [];

        return [{
            pctLabel: `${(Number(rawValue) / 100).toFixed(1)}%`,
            activatedCount,
            lateCount,
        }];
    });
}

const RecoveryScenarioLabel: React.FC<{ scenario: RecoveryScenarioStats }> = ({ scenario }) => {
    const parts = parseRecoveryScenarioParts(scenario.scenarioId);

    if (parts.length === 0) {
        return <>{scenario.label}</>;
    }

    return (
        <>
            {parts.map((part, index) => (
                <React.Fragment key={`${scenario.scenarioId}-${index}`}>
                    {index > 0 && ', '}
                    <span>{part.pctLabel} ({part.activatedCount}</span>
                    {part.lateCount > 0 && (
                        <>
                            {', '}
                            <span>{part.lateCount} </span>
                            <span className="hp-scenario-late">late-race</span>
                        </>
                    )}
                    <span>)</span>
                </React.Fragment>
            ))}
        </>
    );
};

const HpSpurtAnalysisDetail: React.FC<{ stat: CharaHpSpurtStats }> = ({ stat }) => {
    const [modalOpen, setModalOpen] = React.useState(false);
    const [modalTitle, setModalTitle] = React.useState('');
    const [modalData, setModalData] = React.useState<number[]>([]);

    const openModal = (title: string, data: number[]) => {
        setModalTitle(title);
        setModalData(data);
        setModalOpen(true);
    };

    const renderMetricCell = (
        scenario: RecoveryScenarioStats,
        metricLabel: string,
        data: number[],
        options: {
            digits?: number;
            signed?: boolean;
            color?: (value: number) => string;
            emptyLabel?: string;
        } = {}
    ) => {
        if (data.length === 0) {
            return (
                <td className="text-center hp-scenario-cell hp-scenario-cell--empty">
                    {options.emptyLabel ?? '-'}
                </td>
            );
        }

        const { mean, median } = getMeanMedian(data);
        const digits = options.digits ?? 0;
        const signed = options.signed ?? false;
        const color = options.color?.(mean);

        return (
            <td
                className="text-center clickable-cell hp-scenario-cell hp-scenario-cell--metric"
                onClick={() => openModal(`${scenario.label} - ${metricLabel}`, data)}
            >
                <div className="hp-scenario-metric-primary" style={color ? { color } : undefined}>
                    {formatMetric(mean, digits, signed)}
                </div>
                <div className="hp-scenario-metric-secondary">
                    median {formatMetric(median, digits, signed)}
                </div>
            </td>
        );
    };

    const recoveryRows = Object.values(stat.recoveryStats ?? {}).sort((a, b) => b.totalRuns - a.totalRuns);

    return (
        <div className="analysis-detail-container">
            <HpDistributionModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={modalTitle}
                data={modalData}
            />

            <div className="hp-detail-panel">
                <div className="hp-detail-panel__header">
                    <div>
                        <h5 className="hp-detail-panel__title">Recovery Scenario Analysis</h5>
                        <div className="hp-detail-panel__subtitle">
                            Each heal bucket is split by activations before the final third vs during the final third.
                        </div>
                    </div>
                </div>

                {recoveryRows.length === 0 ? (
                    <div className="hp-detail-empty">
                        No recovery skills were detected for this build.
                    </div>
                ) : (
                    <Table className="mb-0 detail-table" size="sm" responsive>
                        <thead>
                            <tr>
                                <th>
                                    Recovery scenario
                                    <div className="hp-th-subtitle">Heal % (early, late / total)</div>
                                </th>
                                <th className="text-center">Runs</th>
                                <th className="text-center">Full spurt</th>
                                <th className="text-center">Survival</th>
                                <th className="text-center"><AvgHeader label="Delay" /></th>
                                <th className="text-center"><AvgHeader label="Speed Diff" /></th>
                                <th className="text-center"><AvgHeader label="HP @ 2/3" /></th>
                                <th className="text-center"><AvgHeader label="Req HP @ 2/3" /></th>
                                <th className="text-center"><AvgHeader label="Spare HP @ 2/3" /></th>
                                <th className="text-center"><AvgHeader label="Final HP" /></th>
                            </tr>
                        </thead>
                        <tbody>
                            {recoveryRows.map((row) => {
                                const fullSpurtRate = (row.fullSpurtCount / row.totalRuns) * 100;
                                const survivalRate = (row.survivalCount / row.totalRuns) * 100;
                                const share = (row.totalRuns / stat.totalRuns) * 100;

                                return (
                                    <tr key={row.scenarioId}>
                                        <td
                                            className="clickable-cell hp-scenario-label-cell"
                                            onClick={() => openModal(`${row.label} - Final HP`, row.hpOutcomes)}
                                        >
                                            <div className="hp-scenario-label">
                                                <RecoveryScenarioLabel scenario={row} />
                                            </div>
                                            <div className="hp-scenario-sharebar">
                                                <div className="hp-scenario-sharebar__fill" style={{ width: `${share}%` }} />
                                            </div>
                                        </td>
                                        <td className="text-center hp-scenario-cell">
                                            <div className="hp-scenario-metric-primary">{row.totalRuns}</div>
                                            <div className="hp-scenario-metric-secondary">{share.toFixed(1)}%</div>
                                        </td>
                                        <td
                                            className="text-center clickable-cell hp-scenario-cell hp-scenario-cell--metric"
                                            onClick={() => openModal(`${row.label} - Full Spurt Final HP`, row.hpOutcomesFullSpurt)}
                                        >
                                            <div className="hp-scenario-metric-primary" style={{ color: getRateColor(fullSpurtRate) }}>
                                                {fullSpurtRate.toFixed(1)}%
                                            </div>
                                            <div className="hp-scenario-metric-secondary">
                                                {row.fullSpurtCount} / {row.totalRuns}
                                            </div>
                                        </td>
                                        <td
                                            className="text-center clickable-cell hp-scenario-cell hp-scenario-cell--metric"
                                            onClick={() => openModal(`${row.label} - Survivor Final HP`, row.hpOutcomes.filter((value) => value > 0))}
                                        >
                                            <div className="hp-scenario-metric-primary" style={{ color: getRateColor(survivalRate) }}>
                                                {survivalRate.toFixed(1)}%
                                            </div>
                                            <div className="hp-scenario-metric-secondary">
                                                {row.survivalCount} / {row.totalRuns}
                                            </div>
                                        </td>
                                        {renderMetricCell(row, 'Spurt Delay', row.spurtDelaySamples, {
                                            digits: 1,
                                            signed: true,
                                            color: getColorForSpurtDelay,
                                        })}
                                        {renderMetricCell(row, 'Target Speed Difference', row.speedDiffSamples, {
                                            digits: 3,
                                            signed: true,
                                            color: getSpeedDiffColor,
                                        })}
                                        {renderMetricCell(row, 'HP at 2/3', row.hpAtPhase3Samples, {
                                            digits: 0,
                                        })}
                                        {renderMetricCell(row, 'Required HP at 2/3', row.requiredHpSamples, {
                                            digits: 0,
                                        })}
                                        {renderMetricCell(row, 'Spare HP at 2/3', row.spareHpSamples, {
                                            digits: 0,
                                            signed: true,
                                            color: getSignedMetricColor,
                                        })}
                                        {renderMetricCell(row, 'Final HP', row.hpOutcomes, {
                                            digits: 0,
                                            signed: true,
                                            color: getSignedMetricColor,
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </Table>
                )}
            </div>

            <div className="hp-detail-panel">
                <div className="hp-detail-panel__header">
                    <h5 className="hp-detail-panel__title">Skill Activations</h5>
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
        </div>
    );
};

export default HpSpurtAnalysisDetail;
