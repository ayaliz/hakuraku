import React from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import * as UMDatabaseUtils from "../../../../data/UMDatabaseUtils";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import CardNamePresenter from "../../../CardNamePresenter";
import CopyButton from "../../../CopyButton";
import {
    getColorForSpurtDelay,
    runningStyleLabel,
    unknownCharaTag,
} from "../../utils/RacePresenterUtils";
import { CharaTableData } from "./types";
import { getRankIcon } from "./rankUtils";

import AssetLoader from "../../../../data/AssetLoader";
let _statIcons: Record<string, string> | null = null;
function getStatIcons() {
    if (!_statIcons) {
        _statIcons = {
            speed: AssetLoader.getStatIcon("speed") ?? "",
            stamina: AssetLoader.getStatIcon("stamina") ?? "",
            power: AssetLoader.getStatIcon("power") ?? "",
            guts: AssetLoader.getStatIcon("guts") ?? "",
            wit: AssetLoader.getStatIcon("wit") ?? "",
            hint: AssetLoader.getStatIcon("hint") ?? "",
        };
    }
    return _statIcons;
}

// Column definition interface for CharaTable
export interface CharaColumnDef {
    key: string;
    header: React.ReactNode;
    cellClassName?: string;
    renderCell: (row: CharaTableData) => React.ReactNode;
    stopPropagation?: boolean;
}

// Shared tooltip info icon component
const InfoIcon = ({ id, tip }: { id: string; tip: string }) => (
    <OverlayTrigger
        placement="bottom"
        overlay={<Tooltip id={id}>{tip}</Tooltip>}
    >
        <span className="header-info" style={{ cursor: 'help', borderBottom: '1px dotted #fff' }}>ⓘ</span>
    </OverlayTrigger>
);

// Stats cell component
const StatsCell: React.FC<{ row: CharaTableData }> = ({ row }) => {
    const iconStyle: React.CSSProperties = { width: 16, height: 16, marginRight: 2 };
    const statStyle: React.CSSProperties = { marginRight: 8, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' };

    const skillBreakdown = row.trainedChara.skills.map(cs => {
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
        return { name: UMDatabaseWrapper.skillName(cs.skillId), base, upgrade, total: base + upgrade };
    }).filter(s => s.total > 0);

    const spTooltip = (
        <Tooltip id={`sp-breakdown-${row.frameOrder}`}>
            <div style={{ textAlign: 'left', fontSize: '0.85em' }}>
                {skillBreakdown.map((s, i) => (
                    <div key={i}>{s.name}: {s.upgrade > 0 ? `${s.base}+${s.upgrade}` : s.base}</div>
                ))}
            </div>
        </Tooltip>
    );

    return (
        <div style={{ lineHeight: 1.4 }}>
            <div>
                <span style={statStyle}><img src={getStatIcons().speed} alt="Speed" style={iconStyle} />{row.trainedChara.speed}</span>
                <span style={statStyle}><img src={getStatIcons().stamina} alt="Stamina" style={iconStyle} />{row.trainedChara.stamina}</span>
                <span style={statStyle}><img src={getStatIcons().wit} alt="Wit" style={iconStyle} />{row.trainedChara.wiz}</span>
            </div>
            <div>
                <span style={statStyle}><img src={getStatIcons().power} alt="Power" style={iconStyle} />{row.trainedChara.pow}</span>
                <span style={statStyle}><img src={getStatIcons().guts} alt="Guts" style={iconStyle} />{row.trainedChara.guts}</span>
                <OverlayTrigger placement="bottom" overlay={spTooltip}>
                    <span style={{ ...statStyle, cursor: 'help' }}><img src={getStatIcons().hint} alt="Skill Points" style={iconStyle} />{row.totalSkillPoints}</span>
                </OverlayTrigger>
            </div>
        </div>
    );
};

// Running style colors
const getRunningStyleColor = (runningStyle: number, isOonige: boolean): string => {
    if (isOonige) return 'rgb(74, 132, 211)'; // Darker blue for Runaway
    switch (runningStyle) {
        case 1: return 'rgb(94, 152, 231)';  // Front Runner - Blue
        case 2: return 'rgb(164, 219, 34)';  // Pace Chaser - Green
        case 3: return 'rgb(253, 222, 52)';  // Late Surger - Yellow
        case 4: return 'rgb(255, 178, 49)';  // End Closer - Orange
        default: return '#9ca3af';
    }
};

export const charaTableColumns: CharaColumnDef[] = [
    {
        key: 'expand',
        header: '',
        cellClassName: 'expand-cell',
        renderCell: () => null, // Handled specially in CharaCard
    },
    {
        key: 'copy',
        header: '',
        cellClassName: 'copy-cell',
        stopPropagation: true,
        renderCell: (row) => <CopyButton content={JSON.stringify(row.trainedChara.rawData)} />,
    },
    {
        key: 'finishOrder',
        header: 'Finish',
        renderCell: (row) => row.finishOrder,
    },
    {
        key: 'frameOrder',
        header: 'No.',
        cellClassName: 'stat-cell',
        renderCell: (row) => row.frameOrder,
    },
    {
        key: 'chara',
        header: 'Character',
        cellClassName: 'chara-name-cell',
        renderCell: (row) => {
            const rankInfo = getRankIcon(row.trainedChara.rankScore);
            return row.chara ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <img
                        src={rankInfo.icon}
                        alt={rankInfo.name}
                        title={`${rankInfo.name} (${row.trainedChara.rankScore})`}
                        style={{ height: 20, width: 'auto' }}
                    />
                    <div>
                        <span className="chara-name-primary">{row.chara.name}</span>
                        <span className="chara-name-card"><CardNamePresenter cardId={row.trainedChara.cardId} /></span>
                        {row.trainedChara.viewerName && (
                            <span className="chara-viewer-name" style={{ color: '#9ca3af', fontSize: '0.75em' }}>[{row.trainedChara.viewerName}]</span>
                        )}
                    </div>
                </div>
            ) : unknownCharaTag;
        },
    },
    {
        key: 'time',
        header: (
            <span>
                Time{' '}
                <InfoIcon
                    id="tooltip-time"
                    tip="The first value is finish time, second time difference to the previous finish. Note that this uses the real race simulation time, the ingame time is highly inaccurate."
                />
            </span>
        ),
        cellClassName: 'time-cell',
        renderCell: (row) => (
            <>
                <span className="time-primary">{UMDatabaseUtils.formatTime(row.horseResultData.finishTimeRaw!)}</span>
                <span className="time-secondary" style={{ color: '#9ca3af' }}>
                    {row.timeDiffToPrev !== undefined && row.timeDiffToPrev > 0
                        ? `+${UMDatabaseUtils.formatTime(row.timeDiffToPrev)}`
                        : ''}
                </span>
            </>
        ),
    },
    {
        key: 'styleMood',
        header: 'Style/Mood',
        renderCell: (row) => {
            const isOonige = row.activatedSkills.has(202051);
            const styleColor = getRunningStyleColor(row.horseResultData.runningStyle!, isOonige);
            return (
                <div style={{ lineHeight: 1.3 }}>
                    <span className="style-badge" style={{ color: styleColor }}>
                        {runningStyleLabel(row.horseResultData, row.activatedSkills)}
                    </span>
                    <br />
                    <span style={{ fontSize: '0.85em', color: '#9ca3af' }}>
                        {UMDatabaseUtils.motivationLabels[row.motivation]}
                    </span>
                </div>
            );
        },
    },
    {
        key: 'startDelay',
        header: (
            <span>
                Start delay{' '}
                <InfoIcon
                    id="tooltip-start-delay"
                    tip="Ingame, a start delay of 80ms or worse is marked as a late start. However, the most devastating effect of high start delay is the loss of 1 frame of acceleration which already occurs at 66ms, so any start that loses that frame of acceleration is marked as a late start here."
                />
            </span>
        ),
        renderCell: (row) => (
            <div style={{ lineHeight: 1.2 }}>
                {row.startDelay !== undefined ? (row.startDelay * 1000).toFixed(1) + 'ms' : '-'}
                <br />
                <span className={`mini-badge ${row.isLateStart ? 'danger' : 'success'}`}>
                    {row.isLateStart ? 'Late' : 'Normal'}
                </span>
            </div>
        ),
    },
    {
        key: 'lastSpurt',
        header: (
            <span>
                Last spurt{' '}
                <InfoIcon
                    id="tooltip-spurt-delay"
                    tip="If an Uma performed a full last spurt, you should see a spurt delay < 3m as well as an observed speed matching the theoretical speed. (Theoretical speed calculation requires the correct track to be selected; see the top left of Replay.) This data may look messed up for career races due to the hidden +400 stat modifier."
                />
            </span>
        ),
        renderCell: (row) => {
            const spurtDist = row.horseResultData.lastSpurtStartDistance;
            if (spurtDist === -1) {
                return <span className="status-bad">No spurt</span>;
            }
            const phase3Start = row.raceDistance * 2 / 3;
            const spurtDelay = spurtDist ? spurtDist - phase3Start : null;
            if (spurtDelay === null) return '-';

            const spurtColor = getColorForSpurtDelay(spurtDelay);
            const speedDiff = (row.maxAdjustedSpeed && row.lastSpurtTargetSpeed)
                ? row.maxAdjustedSpeed - row.lastSpurtTargetSpeed : 0;
            const speedReached = speedDiff >= -0.05;

            return (
                <div style={{ lineHeight: 1.3 }}>
                    <span>Delay: <span style={{ color: spurtColor, fontWeight: 600 }}>{spurtDelay.toFixed(1)}m</span></span>
                    {row.maxAdjustedSpeed && row.lastSpurtTargetSpeed && (
                        <>
                            <br />
                            <span style={{ fontSize: '0.85em' }}>
                                <span style={{ color: '#e5e7eb' }}>Speed: </span>
                                <span style={{ color: speedReached ? '#4ade80' : '#f87171' }}>
                                    {row.maxAdjustedSpeed.toFixed(1)}{Math.abs(speedDiff) >= 0.05 && ` (${speedDiff > 0 ? '+' : ''}${speedDiff.toFixed(1)})`}
                                </span>
                            </span>
                        </>
                    )}
                </div>
            );
        },
    },
    {
        key: 'hpOutcome',
        header: (
            <span>
                HP Result{' '}
                <InfoIcon
                    id="tooltip-hp-result"
                    tip="Shows remaining HP if an Uma made it to the finish without running out of HP, otherwise shows an estimate for missing HP based on observed last spurt speed."
                />
            </span>
        ),
        renderCell: (row) => {
            if (!row.hpOutcome) return '-';
            if (row.hpOutcome.type === 'died') {
                return (
                    <div style={{ lineHeight: 1.3 }}>
                        <span className="status-bad">Died (-{row.hpOutcome.distance.toFixed(0)}m)</span>
                        <br />
                        <span style={{ fontSize: '0.85em', color: '#f87171' }}>
                            -{row.hpOutcome.deficit.toFixed(0)} HP ({((row.hpOutcome.deficit / row.hpOutcome.startHp) * 100).toFixed(1)}%)
                        </span>
                    </div>
                );
            } else {
                return (
                    <div style={{ lineHeight: 1.3 }}>
                        <span className="status-good">Survived</span>
                        <br />
                        <span style={{ fontSize: '0.85em', color: '#4ade80' }}>
                            {Math.round(row.hpOutcome.hp)} HP ({((row.hpOutcome.hp / row.hpOutcome.startHp) * 100).toFixed(1)}%)
                        </span>
                    </div>
                );
            }
        },
    },
    {
        key: 'duelingTime',
        header: (
            <span>
                Dueling{' '}
                <InfoIcon
                    id="tooltip-dueling"
                    tip="Approximate time this Uma spent dueling."
                />
            </span>
        ),
        cellClassName: 'stat-cell',
        renderCell: (row) => {
            if (!row.duelingTime || row.duelingTime < 0.01) return '-';
            return <span style={{ color: '#fbbf24' }}>{row.duelingTime.toFixed(1)}s</span>;
        },
    },
    {
        key: 'downhillModeTime',
        header: (
            <span>
                Downhill{' '}
                <InfoIcon
                    id="tooltip-downhill"
                    tip="Approximate time this Uma spent in downhill mode."
                />
            </span>
        ),
        cellClassName: 'stat-cell',
        renderCell: (row) => {
            if (!row.downhillModeTime || row.downhillModeTime < 0.01) return '-';
            return <span style={{ color: '#60a5fa' }}>{row.downhillModeTime.toFixed(1)}s</span>;
        },
    },
    {
        key: 'paceTime',
        header: (
            <span>
                Pace{' '}
                <InfoIcon
                    id="tooltip-pace"
                    tip="Approximate time this Uma spent in Pace Up mode (or Speed up/Overtake modes if front runner) and Pace Down mode."
                />
            </span>
        ),
        cellClassName: 'stat-cell',
        renderCell: (row) => {
            const hasUp = (row.paceUpTime ?? 0) >= 0.01;
            const hasDown = (row.paceDownTime ?? 0) >= 0.01;
            if (!hasUp && !hasDown) return '-';
            return (
                <div style={{ lineHeight: 1.3 }}>
                    {hasUp && (
                        <span style={{ color: '#4ade80' }}>↑{row.paceUpTime!.toFixed(1)}s</span>
                    )}
                    {hasUp && hasDown && <br />}
                    {hasDown && (
                        <span style={{ color: '#f87171' }}>↓{row.paceDownTime!.toFixed(1)}s</span>
                    )}
                </div>
            );
        },
    },
    {
        key: 'stats',
        header: <span>Stats <InfoIcon id="tooltip-stats" tip="The sixth value is total SP in terms of learned skills, using costs without any hint levels." /></span>,
        cellClassName: 'stat-cell',
        renderCell: (row) => <StatsCell row={row} />,
    },
];
