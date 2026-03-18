import React from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import * as UMDatabaseUtils from "../../../../data/UMDatabaseUtils";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import CopyButton from "../../../CopyButton";
import {
    getColorForSpurtDelay,
    runningStyleLabel,
    unknownCharaTag,
} from "../../utils/RacePresenterUtils";
import { CharaTableData } from "./types";
import { getRankIcon } from "./rankUtils";

import AssetLoader from "../../../../data/AssetLoader";
import { getSkillDef } from "../../../RaceReplay/utils/SkillDataUtils";
import "./CharaList.css";

function hasHpRecoveryEffect(skillId: number): boolean {
    const def = getSkillDef(skillId);
    if (!def) return false;
    return def.conditionGroups.some(group =>
        group.effects.some(eff => eff.type === 9 && eff.value > 0)
    );
}
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

let _styleMoodIcons: { style: Record<number, string>; mood: Record<number, string> } | null = null;
function getStyleMoodIcons() {
    if (!_styleMoodIcons) {
        _styleMoodIcons = {
            style: {
                1: AssetLoader.getStatIcon("front") ?? "",
                2: AssetLoader.getStatIcon("pace") ?? "",
                3: AssetLoader.getStatIcon("late") ?? "",
                4: AssetLoader.getStatIcon("end") ?? "",
            },
            mood: {
                1: AssetLoader.getStatIcon("awful") ?? "",
                2: AssetLoader.getStatIcon("bad") ?? "",
                3: AssetLoader.getStatIcon("normal") ?? "",
                4: AssetLoader.getStatIcon("good") ?? "",
                5: AssetLoader.getStatIcon("great") ?? "",
            },
        };
    }
    return _styleMoodIcons;
}

// Column definition interface for CharaTable
interface CharaColumnDef {
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
        <span className="header-info col-info-icon">ⓘ</span>
    </OverlayTrigger>
);

// Stats cell component
const StatsCell: React.FC<{ row: CharaTableData }> = ({ row }) => {

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
            <div className="col-tooltip-sm">
                {skillBreakdown.map((s, i) => (
                    <div key={i}>{s.name}: {s.upgrade > 0 ? `${s.base}+${s.upgrade}` : s.base}</div>
                ))}
            </div>
        </Tooltip>
    );

    return (
        <div className="col-stats-grid">
            <div>
                <span className="stat-label-item"><img src={getStatIcons().speed} alt="Speed" className="stat-icon" />{row.trainedChara.speed}</span>
                <span className="stat-label-item"><img src={getStatIcons().stamina} alt="Stamina" className="stat-icon" />{row.trainedChara.stamina}</span>
                <span className="stat-label-item"><img src={getStatIcons().wit} alt="Wit" className="stat-icon" />{row.trainedChara.wiz}</span>
            </div>
            <div>
                <span className="stat-label-item"><img src={getStatIcons().power} alt="Power" className="stat-icon" />{row.trainedChara.pow}</span>
                <span className="stat-label-item"><img src={getStatIcons().guts} alt="Guts" className="stat-icon" />{row.trainedChara.guts}</span>
                <OverlayTrigger placement="bottom" overlay={spTooltip}>
                    <span className="stat-label-item col-stat-sp-help"><img src={getStatIcons().hint} alt="Skill Points" className="stat-icon" />{row.totalSkillPoints}</span>
                </OverlayTrigger>
            </div>
        </div>
    );
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
            const charaThumb = AssetLoader.getCharaThumb(row.trainedChara.cardId);
            return row.chara ? (
                <div className="col-chara-ident">
                    <img
                        src={rankInfo.icon}
                        alt={rankInfo.name}
                        title={String(row.trainedChara.rankScore)}
                        className="col-rank-icon"
                    />
                    {charaThumb && (
                        <img
                            src={charaThumb}
                            alt={UMDatabaseWrapper.cards[row.trainedChara.cardId]?.name ?? String(row.trainedChara.cardId)}
                            title={UMDatabaseWrapper.cards[row.trainedChara.cardId]?.name ?? String(row.trainedChara.cardId)}
                            className="col-chara-thumb"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                    )}
                    <div>
                        <span className="chara-name-primary">{row.chara.name}</span>
                        {row.trainedChara.viewerName && (
                            <span className="chara-viewer-name">[{row.trainedChara.viewerName}]</span>
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
                <span className="time-secondary col-time-diff">
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
            const styleName = runningStyleLabel(row.horseResultData, row.activatedSkills);
            const moodName = UMDatabaseUtils.motivationLabels[row.motivation] ?? "";
            const icons = getStyleMoodIcons();
            return (
                <div className="col-style-mood">
                    <img src={icons.style[row.horseResultData.runningStyle!]} alt={styleName} title={styleName} className="col-mood-icon" />
                    <img src={icons.mood[row.motivation]} alt={moodName} title={moodName} className="col-mood-icon" />
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
            <div className="col-start-delay">
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

            const hasHpInfo = row.hpAtPhase3Start !== undefined || row.requiredSpurtHp !== undefined;
            const startHp = row.hpOutcome?.startHp;

            // Detect late-race HP recovery: HP was insufficient at 2/3 AND a healing skill fired in the last 1/3
            const hpInsufficient = row.hpAtPhase3Start !== undefined &&
                row.requiredSpurtHp !== undefined &&
                row.hpAtPhase3Start < row.requiredSpurtHp;
            const lateHealEvents = hpInsufficient
                ? row.skillEvents.filter(evt =>
                    !evt.isMode &&
                    evt.startDistance >= phase3Start &&
                    hasHpRecoveryEffect(evt.skillId)
                )
                : [];
            const hasLateHeal = lateHealEvents.length > 0;
            const blockedIconUrl = hasLateHeal ? AssetLoader.getBlockedIcon() : null;

            const cellContent = (
                <div className={`col-spurt-cell${hasHpInfo || hasLateHeal ? ' col-spurt-help' : ''}`}>
                    <span>Delay: <span className="col-spurt-delay-val" style={{ color: spurtColor }}>{spurtDelay.toFixed(1)}m</span></span>
                    {row.maxAdjustedSpeed && row.lastSpurtTargetSpeed && (
                        <>
                            <br />
                            <span className="col-spurt-speed">
                                <span className="col-spurt-speed-label">Speed: </span>
                                <span className={speedReached ? 'col-speed-ok' : 'col-speed-bad'}>
                                    {row.maxAdjustedSpeed.toFixed(1)}{Math.abs(speedDiff) >= 0.05 && ` (${speedDiff > 0 ? '+' : ''}${speedDiff.toFixed(1)})`}
                                </span>
                                {blockedIconUrl && (
                                    <img src={blockedIconUrl} alt="Potential spurt issue" className="late-heal-icon" />
                                )}
                            </span>
                        </>
                    )}
                </div>
            );

            if (!hasHpInfo && !hasLateHeal) return cellContent;

            const hpPct = (row.hpAtPhase3Start !== undefined && startHp)
                ? ` (${((row.hpAtPhase3Start / startHp) * 100).toFixed(1)}%)`
                : '';
            const hasBoth = row.hpAtPhase3Start !== undefined && row.requiredSpurtHp !== undefined;
            const met = hasBoth ? row.hpAtPhase3Start! >= row.requiredSpurtHp! : undefined;

            const diff = (met !== undefined)
                ? Math.round(row.hpAtPhase3Start! - row.requiredSpurtHp!)
                : undefined;

            const hpTooltip = (
                <Tooltip id={`spurt-hp-${row.frameOrder}`}>
                    <div className="col-hp-tooltip">
                        {row.maxAdjustedSpeedTime !== undefined && row.maxAdjustedSpeedDebug && (() => {
                            const d = row.maxAdjustedSpeedDebug!;
                            const totalBuff = d.skillBuffs.reduce((s, b) => s + b.value, 0) + d.spotStruggleBuff + d.duelingBuff + d.downhillBuff;
                            return (
                                <>
                                    <div>Speed sample: <strong>t={row.maxAdjustedSpeedTime!.toFixed(2)}s</strong>, raw={d.rawSpeed.toFixed(3)}</div>
                                    {d.skillBuffs.map((b, i) => (
                                        <div key={i}>- Skill ({b.name}): <strong>-{b.value.toFixed(3)}</strong></div>
                                    ))}
                                    {d.spotStruggleBuff > 0 && <div>- Spot Struggle: <strong>-{d.spotStruggleBuff.toFixed(3)}</strong></div>}
                                    {d.duelingBuff > 0 && <div>- Dueling: <strong>-{d.duelingBuff.toFixed(3)}</strong></div>}
                                    {d.downhillBuff > 0 && <div>- Downhill: <strong>-{d.downhillBuff.toFixed(3)}</strong></div>}
                                    {totalBuff > 0 && <div>= Adjusted: <strong>{(d.rawSpeed - totalBuff).toFixed(3)}</strong></div>}
                                </>
                            );
                        })()}
                        {row.hpAtPhase3Start !== undefined && (
                            <div>HP at 2/3: <strong>{Math.round(row.hpAtPhase3Start)}</strong>{hpPct}</div>
                        )}
                        {row.requiredSpurtHp !== undefined && (
                            <div>
                                Required HP: <strong>{Math.round(row.requiredSpurtHp)}</strong>
                                {diff !== undefined && (
                                    <span className={diff >= 0 ? 'col-diff-pos' : 'col-diff-neg'}>
                                        {' '}({diff >= 0 ? '+' : ''}{diff})
                                    </span>
                                )}
                            </div>
                        )}
                        {hasLateHeal && (
                            <div className="late-heal-warning">
                                <strong>Potential spurt issue</strong>
                                <div className="late-heal-warning-text">
                                    Last spurt speed may have been reduced prior to the activation of {lateHealEvents.map(e => e.name).join(', ')} in the late-race.
                                </div>
                            </div>
                        )}
                    </div>
                </Tooltip>
            );

            return (
                <OverlayTrigger placement="top" overlay={hpTooltip}>
                    {cellContent}
                </OverlayTrigger>
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
                    <div className="col-hp-outcome">
                        <span className="status-bad">Died (-{row.hpOutcome.distance.toFixed(0)}m)</span>
                        <br />
                        <span className="col-hp-deficit">
                            -{row.hpOutcome.deficit.toFixed(0)} HP ({((row.hpOutcome.deficit / row.hpOutcome.startHp) * 100).toFixed(1)}%)
                        </span>
                    </div>
                );
            } else {
                return (
                    <div className="col-hp-outcome">
                        <span className="status-good">Survived</span>
                        <br />
                        <span className="col-hp-survived">
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
            return <span className="col-dueling-time">{row.duelingTime.toFixed(1)}s</span>;
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
            return <span className="col-downhill-time">{Math.round(row.downhillModeTime * 15 / 16)}s</span>;
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
                <div className="col-pace-cell">
                    {hasUp && (
                        <span className="col-pace-up">↑{Math.round(row.paceUpTime! * 15 / 16)}s</span>
                    )}
                    {hasUp && hasDown && <br />}
                    {hasDown && (
                        <span className="col-pace-down">↓{Math.round(row.paceDownTime! * 15 / 16)}s</span>
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
