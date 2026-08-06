import React, { useState } from 'react';
import { OverlayTrigger, ProgressBar, Tooltip } from 'react-bootstrap';
import './HpSpurtAnalysis.css';
import { CharaHpSpurtStats } from './types';
import UMDatabaseWrapper from '../../../../data/UMDatabaseWrapper';
import { unknownCharaTag } from "../../../../components/RaceDataPresenter/utils/RacePresenterUtils";
import HpSpurtAnalysisDetail from './HpSpurtAnalysisDetail';
import AssetLoader from '../../../../data/AssetLoader';
import { getRankIcon } from '../../../../components/RaceDataPresenter/components/CharaList/rankUtils';

interface HpSpurtTableProps {
    stats: CharaHpSpurtStats[];
}

type SortConfig = {
    key: string;
    direction: 'asc' | 'desc';
};

function avg(values: number[]): number {
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function formatAvgTime(values: number[]): string {
    return values.length > 0 ? `${avg(values).toFixed(1)}s` : '-';
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function formatRaceTime(value: number): string {
    const minutes = Math.floor(value / 60);
    const seconds = value - minutes * 60;
    return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}

let _statIcons: Record<string, string> | null = null;
function getStatIcons() {
    if (!_statIcons) {
        _statIcons = {
            speed:   AssetLoader.getStatIcon('speed')   ?? '',
            stamina: AssetLoader.getStatIcon('stamina') ?? '',
            power:   AssetLoader.getStatIcon('power')   ?? '',
            guts:    AssetLoader.getStatIcon('guts')    ?? '',
            wit:     AssetLoader.getStatIcon('wit')     ?? '',
            hint:    AssetLoader.getStatIcon('hint')    ?? '',
        };
    }
    return _statIcons;
}

const MOOD_LABELS: Record<number, string> = {
    1: 'Awful',
    2: 'Bad',
    3: 'Normal',
    4: 'Good',
    5: 'Great',
};

let _moodIcons: Record<number, string> | null = null;
function getMoodIcons() {
    if (!_moodIcons) {
        _moodIcons = {
            1: AssetLoader.getStatIcon('awful') ?? '',
            2: AssetLoader.getStatIcon('bad') ?? '',
            3: AssetLoader.getStatIcon('normal') ?? '',
            4: AssetLoader.getStatIcon('good') ?? '',
            5: AssetLoader.getStatIcon('great') ?? '',
        };
    }
    return _moodIcons;
}

const StatsCell: React.FC<{ stat: CharaHpSpurtStats }> = ({ stat }) => {
    const tc = stat.trainedChara;
    const skillBreakdown = tc.skills.map(cs => {
        const base = UMDatabaseWrapper.skillNeedPoints[cs.skillId] ?? 0;
        let upgrade = 0;
        if (UMDatabaseWrapper.skills[cs.skillId]?.rarity === 2) {
            const lastDigit = cs.skillId % 10;
            const flippedId = lastDigit === 1 ? cs.skillId + 1 : cs.skillId - 1;
            upgrade = UMDatabaseWrapper.skillNeedPoints[flippedId] ?? 0;
        } else if (UMDatabaseWrapper.skills[cs.skillId]?.rarity === 1 && cs.skillId % 10 === 1) {
            const pairedId = cs.skillId + 1;
            if (UMDatabaseWrapper.skills[pairedId]?.rarity === 1) {
                upgrade = UMDatabaseWrapper.skillNeedPoints[pairedId] ?? 0;
            }
        }
        return { name: UMDatabaseWrapper.skillNameWithEnglishFallback(cs.skillId), base, upgrade, total: base + upgrade };
    }).filter(s => s.total > 0);

    const totalSkillPoints = skillBreakdown.reduce((sum, s) => sum + s.total, 0);

    const spTooltip = (
        <Tooltip id={`sp-${stat.uniqueId}`}>
            <div className="hp-skill-cell">
                {skillBreakdown.map((s, i) => (
                    <div key={i}>{s.name}: {s.upgrade > 0 ? `${s.base}+${s.upgrade}` : s.base}</div>
                ))}
            </div>
        </Tooltip>
    );

    const icons = getStatIcons();
    return (
        <div className="hp-skill-info">
            <div>
                <span className="stat-label-item"><img src={icons.speed}   alt="Speed"   className="stat-icon" />{tc.speed}</span>
                <span className="stat-label-item"><img src={icons.stamina} alt="Stamina" className="stat-icon" />{tc.stamina}</span>
                <span className="stat-label-item"><img src={icons.wit}     alt="Wit"     className="stat-icon" />{tc.wiz}</span>
            </div>
            <div>
                <span className="stat-label-item"><img src={icons.power} alt="Power" className="stat-icon" />{tc.pow}</span>
                <span className="stat-label-item"><img src={icons.guts}  alt="Guts"  className="stat-icon" />{tc.guts}</span>
                <OverlayTrigger placement="bottom" overlay={spTooltip}>
                    <span className="stat-label-item stat-sp-item"><img src={icons.hint} alt="Skill Points" className="stat-icon" />{totalSkillPoints}</span>
                </OverlayTrigger>
            </div>
        </div>
    );
};

const MoodCell: React.FC<{ stat: CharaHpSpurtStats }> = ({ stat }) => {
    const icons = getMoodIcons();
    const moods = [1, 2, 3, 4, 5];
    const renderMood = (mood: number) => (
        <span key={mood} className="hp-mood-count" title={MOOD_LABELS[mood]}>
            <img src={icons[mood]} alt={MOOD_LABELS[mood]} className="hp-mood-icon" />
            <span>{stat.moodCounts[mood] ?? 0}</span>
        </span>
    );

    return (
        <div className="hp-mood-counts">
            <div className="hp-mood-row">{moods.slice(0, 3).map(renderMood)}</div>
            <div className="hp-mood-row">{moods.slice(3).map(renderMood)}</div>
        </div>
    );
};

const ChevronIcon = () => (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
);

const HpSpurtTable: React.FC<HpSpurtTableProps> = ({ stats }) => {
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'charaName', direction: 'asc' });

    const toggleRow = (uniqueId: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(uniqueId)) {
                next.delete(uniqueId);
            } else {
                next.add(uniqueId);
            }
            return next;
        });
    };

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const getSortValue = (row: CharaHpSpurtStats, key: string): number | string => {
        switch (key) {
            case 'charaName':
                return row.charaName;
            case 'rankScore':
                return row.trainedChara.rankScore;
            case 'winRate':
                return row.totalRuns > 0 ? (row.wins / row.totalRuns) : 0;
            case 'top3Rate':
                return row.totalRuns > 0 ? (row.top3Finishes / row.totalRuns) : 0;
            case 'totalRuns':
                return row.totalRuns;
            case 'wins':
                return row.wins;
            case 'fullSpurtRate':
                return row.totalRuns > 0 ? (row.hpOutcomesFullSpurt.length / row.totalRuns) * 100 : 0;
            case 'survivalRate':
                return row.totalRuns > 0 ? (row.survivalCount / row.totalRuns) * 100 : 0;
            case 'avgDownhillModeTime':
                return avg(row.downhillModeTimeSamples);
            case 'dueling':
                return row.totalRuns > 0 ? (row.duelingTimeSamples.length / row.totalRuns) * 100 : 0;
            case 'avgPaceUpDownTime':
                return avg(row.paceUpTimeSamples) + avg(row.paceDownTimeSamples);
            case 'finishTime':
                return avg(row.finishTimeSamples);
            default:
                return 0;
        }
    };

    const sortedData = [...stats].sort((a, b) => {
        const aVal = getSortValue(a, sortConfig.key);
        const bVal = getSortValue(b, sortConfig.key);

        if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortConfig.direction === 'asc'
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
        }

        return sortConfig.direction === 'asc'
            ? (aVal as number) - (bVal as number)
            : (bVal as number) - (aVal as number);
    });

    const SortableHeader = ({ columnKey, children, className }: { columnKey: string; children: React.ReactNode; className?: string }) => (
        <th
            onClick={() => handleSort(columnKey)}
            className={`hp-sortable-th${className ? ` ${className}` : ''}`}
        >
            {children}
            {sortConfig.key === columnKey && (
                <span className="hp-sort-indicator">
                    {sortConfig.direction === 'asc' ? '▲' : '▼'}
                </span>
            )}
        </th>
    );

    return (
        <div className="hp-analysis-wrapper">
            <table className="table table-striped table-hover table-sm hp-analysis-table">
                <thead>
                    <tr>
                        <th className="hp-col-expand"></th>
                        <SortableHeader columnKey="charaName">Character</SortableHeader>
                        <th>Stats <span className="hp-sort-indicator" title="The sixth value is total SP in terms of learned skills, using costs without any hint levels.">ⓘ</span></th>
                        <th className="hp-col-center">Mood</th>
                        <SortableHeader columnKey="rankScore" className="hp-col-center">Score</SortableHeader>
                        <SortableHeader columnKey="totalRuns" className="hp-col-center">Runs</SortableHeader>
                        <SortableHeader columnKey="wins" className="hp-col-center">Wins</SortableHeader>
                        <SortableHeader columnKey="winRate" className="hp-col-center">Win Rate</SortableHeader>
                        <SortableHeader columnKey="top3Rate" className="hp-col-center">Top 3 %</SortableHeader>
                        <SortableHeader columnKey="fullSpurtRate">Full Spurt Rate</SortableHeader>
                        <SortableHeader columnKey="survivalRate">Survival Rate</SortableHeader>
                        <SortableHeader columnKey="avgDownhillModeTime" className="hp-col-center">Avg Downhill</SortableHeader>
                        <SortableHeader columnKey="dueling" className="hp-col-center">Dueling</SortableHeader>
                        <SortableHeader columnKey="avgPaceUpDownTime" className="hp-col-center">Avg Pace</SortableHeader>
                        <SortableHeader columnKey="finishTime" className="hp-col-center">Finish Times</SortableHeader>
                    </tr>
                </thead>
                <tbody>
                    {sortedData.flatMap(row => {
                        const isExpanded = expandedRows.has(row.uniqueId);
                        const charaData = UMDatabaseWrapper.charas[row.charaId];
                        const charaThumb = AssetLoader.getCharaThumb(row.cardId);
                        const rankInfo = getRankIcon(row.trainedChara.rankScore);

                        const winRate = row.totalRuns > 0 ? (row.wins / row.totalRuns) * 100 : 0;
                        const top3Rate = row.totalRuns > 0 ? (row.top3Finishes / row.totalRuns) * 100 : 0;
                        const fullSpurtRate = row.totalRuns > 0 ? (row.hpOutcomesFullSpurt.length / row.totalRuns) * 100 : 0;
                        const survivalRate = row.totalRuns > 0 ? (row.survivalCount / row.totalRuns) * 100 : 0;
                        const duelProcRate = row.totalRuns > 0 ? (row.duelingTimeSamples.length / row.totalRuns) * 100 : 0;
                        const averageFinishTime = avg(row.finishTimeSamples);
                        const medianFinishTime = median(row.finishTimeSamples);
                        const fastestFinishTime = row.finishTimeSamples.length > 0 ? Math.min(...row.finishTimeSamples) : 0;
                        const slowestFinishTime = row.finishTimeSamples.length > 0 ? Math.max(...row.finishTimeSamples) : 0;

                        const mainRow = (
                            <tr key={`main-${row.uniqueId}`} onClick={() => toggleRow(row.uniqueId)}>
                                <td className="hp-expand-td">
                                    <span className={`hp-expand-chevron${isExpanded ? ' is-expanded' : ''}`}>
                                        <ChevronIcon />
                                    </span>
                                </td>
                                <td>
                                    {charaData ? (
                                        <div className="hp-chara-cell">
                                            {charaThumb && (
                                                <img
                                                    src={charaThumb}
                                                    alt={charaData.name}
                                                    title={UMDatabaseWrapper.cards[row.cardId]?.name ?? charaData.name}
                                                    className="hp-chara-portrait"
                                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                />
                                            )}
                                            <span className="hp-chara-name">{charaData.name}</span>
                                        </div>
                                    ) : unknownCharaTag}
                                </td>
                                <td><StatsCell stat={row} /></td>
                                <td className="hp-col-center"><MoodCell stat={row} /></td>
                                <td className="hp-col-center">
                                    <div className="hp-score-cell">
                                        <img src={rankInfo.icon} alt={rankInfo.name} title={String(row.trainedChara.rankScore)} className="hp-rank-icon" />
                                        {row.trainedChara.rankScore}
                                    </div>
                                </td>
                                <td className="hp-col-center">{row.totalRuns}</td>
                                <td className="hp-col-center">{row.wins}</td>
                                <td className="hp-col-center">
                                    <span className="hp-rate-value" style={{ color: winRate > 50 ? '#4ade80' : winRate > 20 ? '#facc15' : '#e2e8f0' }}>
                                        {winRate.toFixed(1)}%
                                    </span>
                                </td>
                                <td className="hp-col-center">
                                    <span className="hp-rate-value" style={{ color: top3Rate > 80 ? '#4ade80' : top3Rate > 50 ? '#facc15' : '#e2e8f0' }}>
                                        {top3Rate.toFixed(1)}% <span className="hp-rate-count text-muted">({row.top3Finishes})</span>
                                    </span>
                                </td>
                                <td>
                                    <div className="hp-progress-container">
                                        <div className="hp-progress-bar">
                                            <ProgressBar
                                                now={fullSpurtRate}
                                                variant={fullSpurtRate > 80 ? 'success' : fullSpurtRate > 50 ? 'warning' : 'danger'}
                                            />
                                        </div>
                                        <span className="hp-progress-value">{fullSpurtRate.toFixed(1)}%</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="hp-progress-container">
                                        <div className="hp-progress-bar">
                                            <ProgressBar
                                                now={survivalRate}
                                                variant={survivalRate > 80 ? 'success' : survivalRate > 50 ? 'warning' : 'danger'}
                                            />
                                        </div>
                                        <span className="hp-progress-value">{survivalRate.toFixed(1)}%</span>
                                    </div>
                                </td>
                                <td className="hp-col-center" title={`${row.downhillModeTimeSamples.length} active sample(s)`}>
                                    <div className="hp-mode-time-cell">
                                        <div className="hp-mode-downhill">{formatAvgTime(row.downhillModeTimeSamples)}</div>
                                        {row.downhillModeTimePreLateSamples.length > 0 && (
                                            <div className="hp-mode-time-sub hp-mode-downhill-sub">
                                                ({formatAvgTime(row.downhillModeTimePreLateSamples)} pre-late)
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="hp-col-center" title={`${row.duelingTimeSamples.length} duel sample(s)`}>
                                    <div className="hp-dueling-cell">
                                        <span className="hp-rate-value">
                                            {duelProcRate.toFixed(1)}% <span className="hp-rate-count text-muted">({row.duelingTimeSamples.length})</span>
                                        </span>
                                        <span className="hp-dueling-average">{formatAvgTime(row.duelingTimeSamples)} avg</span>
                                    </div>
                                </td>
                                <td className="hp-col-center" title={`${row.paceUpTimeSamples.length} pace up sample(s), ${row.paceDownTimeSamples.length} pace down sample(s)`}>
                                    <div className="hp-mode-time-cell">
                                        {row.paceUpTimeSamples.length > 0 && (
                                            <div className="col-pace-up">↑{formatAvgTime(row.paceUpTimeSamples)}</div>
                                        )}
                                        {row.paceDownTimeSamples.length > 0 && (
                                            <div className="col-pace-down">↓{formatAvgTime(row.paceDownTimeSamples)}</div>
                                        )}
                                        {row.paceUpTimeSamples.length === 0 && row.paceDownTimeSamples.length === 0 ? '-' : null}
                                    </div>
                                </td>
                                <td className="hp-col-center" title={`${row.finishTimeSamples.length} finish time sample(s)`}>
                                    {row.finishTimeSamples.length > 0 ? (
                                        <div className="hp-finish-time-cell">
                                            <span className="hp-finish-time-primary">Avg {formatRaceTime(averageFinishTime)}</span>
                                            <span>Median {formatRaceTime(medianFinishTime)}</span>
                                            <span>{formatRaceTime(fastestFinishTime)} - {formatRaceTime(slowestFinishTime)}</span>
                                        </div>
                                    ) : '-'}
                                </td>
                            </tr>
                        );

                        if (!isExpanded) {
                            return [mainRow];
                        }

                        const expandedRow = (
                            <tr key={`expanded-${row.uniqueId}`}>
                                <td colSpan={15} className="hp-expanded-td">
                                    <HpSpurtAnalysisDetail stat={row} />
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

export default HpSpurtTable;
