import React, { useState } from 'react';
import { ProgressBar } from 'react-bootstrap';
import { CharaHpSpurtStats } from './types';
import UMDatabaseWrapper from '../../../../data/UMDatabaseWrapper';
import CardNamePresenter from "../../../../components/CardNamePresenter";
import { unknownCharaTag } from "../../../../components/RaceDataPresenter/utils/RacePresenterUtils";
import HpSpurtAnalysisDetail from './HpSpurtAnalysisDetail';

interface HpSpurtTableProps {
    stats: CharaHpSpurtStats[];
}

type SortConfig = {
    key: string;
    direction: 'asc' | 'desc';
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
            case 'fullSpurtRate':
                return row.totalRuns > 0 ? (row.hpOutcomesFullSpurt.length / row.totalRuns) * 100 : 0;
            case 'survivalRate':
                return row.totalRuns > 0 ? (row.survivalCount / row.totalRuns) * 100 : 0;
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

    const SortableHeader = ({ columnKey, children }: { columnKey: string; children: React.ReactNode }) => (
        <th
            onClick={() => handleSort(columnKey)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
        >
            {children}
            {sortConfig.key === columnKey && (
                <span style={{ marginLeft: '4px', fontSize: '0.8em' }}>
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
                        <th style={{ width: '30px' }}></th>
                        <SortableHeader columnKey="charaName">Character</SortableHeader>
                        <SortableHeader columnKey="rankScore">Score</SortableHeader>
                        <SortableHeader columnKey="winRate">Win Rate</SortableHeader>
                        <SortableHeader columnKey="top3Rate">Top 3 %</SortableHeader>
                        <SortableHeader columnKey="totalRuns">Runs</SortableHeader>
                        <SortableHeader columnKey="fullSpurtRate">Full Spurt Rate</SortableHeader>
                        <SortableHeader columnKey="survivalRate">Survival Rate</SortableHeader>
                    </tr>
                </thead>
                <tbody>
                    {sortedData.flatMap(row => {
                        const isExpanded = expandedRows.has(row.uniqueId);
                        const charaData = UMDatabaseWrapper.charas[row.charaId];
                        const cardName = UMDatabaseWrapper.cards[row.cardId]?.name;

                        const winRate = row.totalRuns > 0 ? (row.wins / row.totalRuns) * 100 : 0;
                        const top3Rate = row.totalRuns > 0 ? (row.top3Finishes / row.totalRuns) * 100 : 0;
                        const fullSpurtRate = row.totalRuns > 0 ? (row.hpOutcomesFullSpurt.length / row.totalRuns) * 100 : 0;
                        const survivalRate = row.totalRuns > 0 ? (row.survivalCount / row.totalRuns) * 100 : 0;

                        const mainRow = (
                            <tr key={`main-${row.uniqueId}`}>
                                <td
                                    style={{ textAlign: 'center', cursor: 'pointer' }}
                                    onClick={() => toggleRow(row.uniqueId)}
                                >
                                    <span style={{ display: 'inline-block', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>
                                        <ChevronIcon />
                                    </span>
                                </td>
                                <td>
                                    {charaData ? (
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{charaData.name}</div>
                                            <div className="text-muted" style={{ fontSize: '0.85em' }}>
                                                {cardName || <CardNamePresenter cardId={row.cardId} />}
                                            </div>
                                        </div>
                                    ) : unknownCharaTag}
                                </td>
                                <td>{row.trainedChara.rankScore}</td>
                                <td>
                                    <span style={{
                                        fontWeight: 'bold',
                                        color: winRate > 50 ? '#4ade80' : winRate > 20 ? '#facc15' : '#e2e8f0'
                                    }}>
                                        {winRate.toFixed(1)}% <span className="text-muted" style={{ fontWeight: 'normal', fontSize: '0.9em' }}>({row.wins})</span>
                                    </span>
                                </td>
                                <td>
                                    <span style={{
                                        fontWeight: 'bold',
                                        color: top3Rate > 80 ? '#4ade80' : top3Rate > 50 ? '#facc15' : '#e2e8f0'
                                    }}>
                                        {top3Rate.toFixed(1)}% <span className="text-muted" style={{ fontWeight: 'normal', fontSize: '0.9em' }}>({row.top3Finishes})</span>
                                    </span>
                                </td>
                                <td className="text-center">{row.totalRuns}</td>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <div style={{ flexGrow: 1, marginRight: '8px' }}>
                                            <ProgressBar
                                                now={fullSpurtRate}
                                                variant={fullSpurtRate > 80 ? 'success' : fullSpurtRate > 50 ? 'warning' : 'danger'}
                                                style={{ height: '8px' }}
                                            />
                                        </div>
                                        <span style={{ minWidth: '45px', textAlign: 'right', fontWeight: 'bold' }}>{fullSpurtRate.toFixed(1)}%</span>
                                    </div>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <div style={{ flexGrow: 1, marginRight: '8px' }}>
                                            <ProgressBar
                                                now={survivalRate}
                                                variant={survivalRate > 80 ? 'success' : survivalRate > 50 ? 'warning' : 'danger'}
                                                style={{ height: '8px' }}
                                            />
                                        </div>
                                        <span style={{ minWidth: '45px', textAlign: 'right', fontWeight: 'bold' }}>{survivalRate.toFixed(1)}%</span>
                                    </div>
                                </td>
                            </tr>
                        );

                        if (!isExpanded) {
                            return [mainRow];
                        }

                        const expandedRow = (
                            <tr key={`expanded-${row.uniqueId}`}>
                                <td colSpan={8} style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: 0 }}>
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
