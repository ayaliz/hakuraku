import React from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import * as UMDatabaseUtils from "../../../../data/UMDatabaseUtils";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import {
    getColorForSpurtDelay,
    runningStyleLabel,
    unknownCharaTag,
} from "../../utils/RacePresenterUtils";
import { CharaTableData } from "./types";
import { getRankIcon } from "./rankUtils";
import { hasLowHpNegativeSpurtSuspicion } from "./utils";

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

function getExpectedObservedSpurtSpeed(speed: number): number {
    return Math.floor((speed + 1e-9) * 100) / 100;
}

function HpDebuffSummary({ row }: { row: CharaTableData }) {
    const hits = row.hpDebuffHits ?? [];
    if (hits.length === 0) return null;
    const total = hits.reduce((sum, hit) => sum + hit.estimatedHpDrain, 0);

    const timingGroups = (
        ([false, true] as const).map(isLateRace => {
            const timingHits = hits.filter(hit => hit.isLateRace === isLateRace);
            if (timingHits.length === 0) return null;
            const timingTotal = timingHits.reduce((sum, hit) => sum + hit.estimatedHpDrain, 0);
            return (
                <div key={isLateRace ? 'late' : 'pre-late'} className="hp-drain-timing-group">
                    <div className="hp-drain-timing-heading">
                        {isLateRace ? 'Late race' : 'Pre-late race'}: {timingTotal.toFixed(1)} HP
                    </div>
                    {timingHits.map((hit, index) => (
                        <div key={`${hit.skillId}-${hit.time}-${index}`} className="hp-debuff-hit">
                            {hit.skillName}{hit.isSelfCost ? '' : ` by ${hit.casterName}`}: {hit.estimatedHpDrain.toFixed(1)} HP
                            {' '}({(hit.drainRatio * 100).toFixed(1)}%)
                        </div>
                    ))}
                </div>
            );
        })
    );

    return (
        <div className="hp-debuff-summary">
            <div><strong>HP loss from skills: {total.toFixed(1)}</strong></div>
            {timingGroups}
        </div>
    );
}

function RushedSummary({ row }: { row: CharaTableData }) {
    const rushedEvents = row.rushedEvents ?? [];
    if (rushedEvents.length === 0 || !(row.rushedDuration && row.rushedDuration > 0)) return null;
    const isFrenzied = rushedEvents.some(event => event.name.includes("Frenzied"));

    return (
        <div className="rushed-summary">
            <div>
                <strong>Rushed duration: {row.rushedDuration.toFixed(2)}s</strong>
                {isFrenzied && ' (Frenzied)'}
            </div>
        </div>
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

function getWorldTransformLossColor(loss: number, minLoss: number, maxLoss: number) {
    const normalized = maxLoss > minLoss ? (loss - minLoss) / (maxLoss - minLoss) : 0.5;
    const clamped = Math.min(Math.max(normalized, 0), 1);
    const red = Math.round(76 + (220 - 76) * clamped);
    const green = Math.round(175 + (88 - 175) * clamped);
    const blue = Math.round(80 + (80 - 80) * clamped);
    return `rgb(${red}, ${green}, ${blue})`;
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
        return { name: UMDatabaseWrapper.skillNameWithEnglishFallback(cs.skillId), base, upgrade, total: base + upgrade };
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


const predictionColumn: CharaColumnDef = {
    key: 'predictedWin',
    header: (
        <span>
            Pred Win{' '}
            <InfoIcon
                id="tooltip-predicted-win"
                tip="Estimated win chance for each uma. It considers stats, learned skills, running style, mood, gate draws and the context of the other umas in the room."
            />
        </span>
    ),
    renderCell: (row) => {
        if (row.predictedWinProbability === undefined) {
            return '—';
        }
        return (
            <div className="col-prediction-cell">
                <span className={`col-prediction-primary${row.predictionRank === 1 ? ' top' : ''}`}>
                    {(row.predictedWinProbability * 100).toFixed(1)}%
                </span>
                <span className="col-prediction-rank">
                    Pred #{row.predictionRank ?? '-'}
                </span>
            </div>
        );
    },
};

function createWorldTransformColumn(minLoss: number, maxLoss: number): CharaColumnDef {
    return {
        key: 'worldTransformLoss',
        header: (
            <span>
                WT{' '}
                <InfoIcon
                    id="tooltip-world-transform"
                    tip="Estimated losses from world transform, i.e. distance loss from moving lanes, as well as being on outside lanes on corners."
                />
            </span>
        ),
        cellClassName: 'stat-cell',
        renderCell: (row) => {
            if (row.worldTransformLossTotal === undefined) {
                return '-';
            }
            return (
                <span
                    className="col-downhill-time"
                    style={{ color: getWorldTransformLossColor(row.worldTransformLossTotal, minLoss, maxLoss) }}
                >
                    -{row.worldTransformLossTotal.toFixed(2)}m
                </span>
            );
        },
    };
}

const baseCharaTableColumns: CharaColumnDef[] = [
    {
        key: 'expand',
        header: '',
        cellClassName: 'expand-cell',
        renderCell: () => null, // Handled specially in CharaCard
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
            const portraitCardId = row.trainedChara.cardId > 0
                ? row.trainedChara.cardId
                : row.chara?.id
                    ? row.chara.id * 100 + 1
                    : undefined;
            const charaThumb = portraitCardId !== undefined
                ? AssetLoader.getCharaThumb(portraitCardId)
                : undefined;
            const portraitName = portraitCardId !== undefined
                ? UMDatabaseWrapper.cards[portraitCardId]?.name ?? row.displayName ?? String(portraitCardId)
                : row.displayName ?? '';
            return (
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
                            alt={portraitName}
                            title={portraitName}
                            className="col-chara-thumb"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                    )}
                    <div>
                        <span className="chara-name-primary">{row.displayName ?? unknownCharaTag}</span>
                        {row.subLabel && (
                            <span className="chara-viewer-name">{row.subLabel}</span>
                        )}
                    </div>
                </div>
            );
        },
    },
    {
        key: 'time',
        header: (
            <span>
                Time{' '}
                <InfoIcon
                    id="tooltip-time"
                    tip="The first value is finish time, second value is the distance to the previous finisher at the moment they finish. Note that the finish time uses the real race simulation time, the ingame time is highly inaccurate."
                />
            </span>
        ),
        cellClassName: 'time-cell',
        renderCell: (row) => (
            <>
                <span className="time-primary">{UMDatabaseUtils.formatTime(row.horseResultData.finishTimeRaw!)}</span>
                <span className="time-secondary col-time-diff">
                    {row.finishDistanceToPrev !== undefined && row.finishDistanceToPrev > 0
                        ? `+${row.finishDistanceToPrev.toFixed(1)}m`
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
                Delay{' '}
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
                const noSpurtContent = <span className="status-bad">No spurt</span>;
                if (!row.hpDebuffHits?.length && !row.rushedEvents?.length) return noSpurtContent;
                return (
                    <OverlayTrigger
                        placement="auto"
                        overlay={
                            <Tooltip id={`spurt-hp-${row.frameOrder}`}>
                                <div className="col-hp-tooltip">
                                    <HpDebuffSummary row={row} />
                                    <RushedSummary row={row} />
                                </div>
                            </Tooltip>
                        }
                    >
                        <span className="col-spurt-help">{noSpurtContent}</span>
                    </OverlayTrigger>
                );
            }
            const phase3Start = row.raceDistance * 2 / 3;
            const spurtDelay = spurtDist ? spurtDist - phase3Start : null;
            if (spurtDelay === null) return '-';

            const spurtColor = getColorForSpurtDelay(spurtDelay);
            const expectedObservedSpurtSpeed = row.lastSpurtTargetSpeed !== undefined
                ? getExpectedObservedSpurtSpeed(row.lastSpurtTargetSpeed)
                : undefined;
            const speedDiff = (row.maxAdjustedSpeed && expectedObservedSpurtSpeed)
                ? row.maxAdjustedSpeed - expectedObservedSpurtSpeed : 0;
            const speedReached = speedDiff >= -0.05;
            const hasLowHpSpurtSuspicion = hasLowHpNegativeSpurtSuspicion(
                row.hpAtPhase3Start,
                row.requiredSpurtHp,
                speedDiff
            );

            const hasHpInfo = row.hpAtPhase3Start !== undefined || row.requiredSpurtHp !== undefined;
            const hasHpDebuffs = (row.hpDebuffHits?.length ?? 0) > 0;
            const hasRushed = (row.rushedEvents?.length ?? 0) > 0;
            const hasSpurtSpeedInfo = row.maxAdjustedSpeed !== undefined || expectedObservedSpurtSpeed !== undefined;
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
            const hasPotentialSpurtIssue = hasLateHeal || hasLowHpSpurtSuspicion;
            const blockedIconUrl = hasPotentialSpurtIssue ? AssetLoader.getBlockedIcon() : null;

            const cellContent = (
                <div className={`col-spurt-cell${hasHpInfo || hasPotentialSpurtIssue || hasHpDebuffs || hasRushed || hasSpurtSpeedInfo ? ' col-spurt-help' : ''}`}>
                    <span>Delay: <span className="col-spurt-delay-val" style={{ color: spurtColor }}>{spurtDelay.toFixed(1)}m</span></span>
                    {row.maxAdjustedSpeed && row.lastSpurtTargetSpeed && (
                        <>
                            <br />
                            <span className="col-spurt-speed">
                                <span className="col-spurt-speed-label">Speed: </span>
                                <span className={speedReached ? 'col-speed-ok' : 'col-speed-bad'}>
                                    {getExpectedObservedSpurtSpeed(row.maxAdjustedSpeed).toFixed(2)}{Math.abs(speedDiff) >= 0.05 && ` (${speedDiff > 0 ? '+' : ''}${speedDiff.toFixed(2)})`}
                                </span>
                                {blockedIconUrl && (
                                    <img src={blockedIconUrl} alt="Potential spurt issue" className="late-heal-icon" />
                                )}
                            </span>
                        </>
                    )}
                </div>
            );

            if (!hasHpInfo && !hasPotentialSpurtIssue && !hasHpDebuffs && !hasRushed && !hasSpurtSpeedInfo) return cellContent;

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
                        {row.maxAdjustedSpeed !== undefined && (
                            <div>
                                Observed spurt speed: <strong>{getExpectedObservedSpurtSpeed(row.maxAdjustedSpeed).toFixed(2)} m/s</strong>
                                {row.maxAdjustedSpeedTime !== undefined && ` [${row.maxAdjustedSpeedTime.toFixed(2)}s]`}
                            </div>
                        )}
                        {expectedObservedSpurtSpeed !== undefined && (
                            <div>Calculated spurt speed: <strong>{expectedObservedSpurtSpeed.toFixed(2)} m/s</strong></div>
                        )}
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
                        <HpDebuffSummary row={row} />
                        <RushedSummary row={row} />
                        {hasLateHeal && (
                            <div className="late-heal-warning">
                                <strong>Potential spurt issue</strong>
                                <div className="late-heal-warning-text">
                                    Last spurt speed may have been reduced prior to the activation of {lateHealEvents.map(e => e.name).join(', ')} in the late-race.
                                </div>
                            </div>
                        )}
                        {hasLowHpSpurtSuspicion && (
                            <div className="late-heal-warning">
                                <strong>Potential spurt issue</strong>
                                <div className="late-heal-warning-text">
                                    Spare HP at 2/3 was under 10, so a negative spurt may be hidden by duel speed even though the observed sample looks faster than theoretical.
                                </div>
                            </div>
                        )}
                    </div>
                </Tooltip>
            );

            return (
                <OverlayTrigger placement="auto" overlay={hpTooltip}>
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
                Duel{' '}
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
            const totalSecs = Math.round(row.downhillModeTime * 15 / 16);
            const preLateSecs = Math.round((row.downhillModeTimePreLate ?? 0) * 15 / 16);
            const lateSecs = Math.max(0, Math.round((row.downhillModeTimeLate ?? Math.max(0, row.downhillModeTime - (row.downhillModeTimePreLate ?? 0))) * 15 / 16));
            const hasSplit = preLateSecs > 0 || lateSecs > 0;
            return (
                <div className="col-downhill-cell">
                    <div className="col-downhill-time">{totalSecs}s</div>
                    {hasSplit && (
                        <div className="col-downhill-split">
                            ({preLateSecs}s pre-late{lateSecs > 0 ? ` / ${lateSecs}s late` : ''})
                        </div>
                    )}
                </div>
            );
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

export function getCharaTableColumns(data: CharaTableData[], showPredictionColumn = false): CharaColumnDef[] {
    let columns = [...baseCharaTableColumns];
    const worldTransformLosses = data
        .map((row) => row.worldTransformLossTotal)
        .filter((loss): loss is number => loss !== undefined);
    const minWorldTransformLoss = worldTransformLosses.length > 0 ? Math.min(...worldTransformLosses) : 0;
    const maxWorldTransformLoss = worldTransformLosses.length > 0 ? Math.max(...worldTransformLosses) : 0;
    const worldTransformColumn = createWorldTransformColumn(minWorldTransformLoss, maxWorldTransformLoss);

    const wtInsertAfterKey = 'paceTime';
    const wtInsertIndex = columns.findIndex((column) => column.key === wtInsertAfterKey);
    if (wtInsertIndex === -1) {
        columns.push(worldTransformColumn);
    } else {
        columns = [
            ...columns.slice(0, wtInsertIndex + 1),
            worldTransformColumn,
            ...columns.slice(wtInsertIndex + 1),
        ];
    }

    if (!showPredictionColumn) {
        return columns;
    }

    const predictionInsertAfterKey = 'time';
    const predictionInsertIndex = columns.findIndex((column) => column.key === predictionInsertAfterKey);
    if (predictionInsertIndex === -1) {
        return [...columns, predictionColumn];
    }

    return [
        ...columns.slice(0, predictionInsertIndex + 1),
        predictionColumn,
        ...columns.slice(predictionInsertIndex + 1),
    ];
}
