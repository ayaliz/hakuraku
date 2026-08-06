import React, { useState } from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import './CharaList.css';
import { CharaTableData, ParentEntry } from "./types";
import { aggregateFactors, formatFactor, getCharaImageUrl, getFactorColor } from "./utils";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import CharaProperLabels from "../../../CharaProperLabels";
import { getCharaTableColumns } from "./columns";
import { getSkillDef } from "../../../RaceReplay/utils/SkillDataUtils";
import { getCourseAptitudeFilters } from "../../../../pages/MultiRacePage/utils";
import AssetLoader from "../../../../data/AssetLoader";
import SkillBreakdownModal from "./SkillBreakdownModal";
import type { SkillLotteryResult } from "../../utils/witLottery";
import type { CharaSkill } from "../../../../data/TrainedCharaData";

const ChevronIcon = () => (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
);

interface CharaTableProps {
    data: CharaTableData[];
    courseId?: number;
    showPredictionColumn?: boolean;
}

const ParentGroup = ({ parents }: { parents: ParentEntry[] }) => {
    const sortedParents = [...parents].sort((a, b) => a.positionId - b.positionId);
    if (sortedParents.length === 0) return null;

    const aggregatedFactors = aggregateFactors(sortedParents);

    return (
        <div className="parent-group-container">
            <div className="parent-images-flex">
                {sortedParents.map((p, idx) => (
                    <img
                        key={idx}
                        src={getCharaImageUrl(p.cardId)}
                        alt={String(p.cardId)}
                        className="parent-img"
                        title={`ID: ${p.cardId} (Pos: ${p.positionId})`}
                        onError={(e) => (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzU1NSIvPjwvc3ZnPg=='}
                    />
                ))}
            </div>
            <div className="d-flex flex-wrap">
                {aggregatedFactors.length === 0 ? <span className="text-muted">No factors</span> : aggregatedFactors.map((f, fIdx) => {
                    let name = f.nameOverride;
                    if (!name) {
                        const formatted = formatFactor(f.id);
                        name = formatted ? formatted.name : `Factor ${f.id}`;
                    }
                    return (
                        <span key={fIdx} className="factor-badge">
                            <span style={{ color: getFactorColor(f.id), fontWeight: 600 }}>{name}</span>
                            <span className="cc-factor-level">{f.level}★</span>
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

const CharaTable: React.FC<CharaTableProps> = ({ data, courseId, showPredictionColumn = false }) => {
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
    const [selectedSkillRow, setSelectedSkillRow] = useState<CharaTableData | null>(null);

    const aptitudeFilters = getCourseAptitudeFilters(courseId);
    const charaTableColumns = getCharaTableColumns(data, showPredictionColumn);

    const toggleRow = (frameOrder: number) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(frameOrder)) {
                next.delete(frameOrder);
            } else {
                next.add(frameOrder);
            }
            return next;
        });
    };

    return (
        <div className={`chara-table-wrapper${showPredictionColumn ? ' chara-table-wrapper--with-prediction' : ''}`}>
            <table className="chara-table">
                <thead>
                    <tr>
                        {charaTableColumns.map(col => {
                            if (col.key === 'expand') {
                                return (
                                    <th key={col.key}>
                                        <button
                                            onClick={() => setExpandedRows(new Set())}
                                            title="Collapse all rows"
                                            className="cc-expand-btn"
                                        >
                                            {expandedRows.size === 0 ? '' : '⊟'}
                                        </button>
                                    </th>
                                );
                            }
                            return <th key={col.key}>{col.header}</th>;
                        })}
                    </tr>
                </thead>
                <tbody>
                    {data.flatMap(row => {
                        const isExpanded = expandedRows.has(row.frameOrder);
                        const rank = row.finishOrder;
                        const rankClass = rank <= 3 ? `rank-${rank}` : '';

                        const parentGroup1 = row.parents.filter(p => Math.floor(p.positionId / 10) === 1);
                        const parentGroup2 = row.parents.filter(p => Math.floor(p.positionId / 10) === 2);

                        const mainRow = (
                            <tr key={`main-${row.frameOrder}`} className={isExpanded ? 'expanded' : ''} onClick={() => toggleRow(row.frameOrder)}>
                                {charaTableColumns.map(col => {
                                    // Special handling for certain columns
                                    if (col.key === 'expand') {
                                        return (
                                            <td key={col.key} className={col.cellClassName}>
                                                <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
                                                    <ChevronIcon />
                                                </span>
                                            </td>
                                        );
                                    }
                                    if (col.key === 'finishOrder') {
                                        return (
                                            <td key={col.key} className={`rank-cell ${rankClass}`}>
                                                {col.renderCell(row)}
                                            </td>
                                        );
                                    }

                                    const handleClick = col.stopPropagation ? (e: React.MouseEvent) => e.stopPropagation() : undefined;
                                    return (
                                        <td key={col.key} className={col.cellClassName} onClick={handleClick}>
                                            {col.renderCell(row)}
                                        </td>
                                    );
                                })}
                            </tr>
                        );

                        if (!isExpanded) {
                            return [mainRow];
                        }

                        const expandedRow = (
                            <tr key={`expanded-${row.frameOrder}`}>
                                <td colSpan={charaTableColumns.length} className="expanded-content">
                                    <div className="dashboard-grid">
                                        {/* Skills Panel */}
                                        <div className="dashboard-panel panel-skills">
                                            <div
                                                className="dashboard-panel-header"
                                                onClick={() => setSelectedSkillRow(row)}
                                            >
                                                <span>Skills ({row.trainedChara.skills.length})</span>
                                                <span className="skills-breakdown-hint">Click for breakdown</span>
                                            </div>
                                            <div className="skills-list" onClick={() => setSelectedSkillRow(row)}>
                                                {(() => {
                                                    const skillGroups = buildSkillListGroups(row);

                                                    return skillGroups.flatMap((group) => {
                                                        const header = (
                                                            <div key={`group-${group.key}`} className="skill-list-group-header">
                                                                {group.label}
                                                            </div>
                                                        );
                                                        const items = group.skills.map((cs) => {
                                                            const count = row.activatedSkillCounts.get(cs.skillId);
                                                            const skillDef = getSkillDef(cs.skillId);
                                                            const usedBadge = count ? getUsedSkillBadge(cs.skillId, count, row.skillLotteryResults?.get(cs.skillId)) : undefined;
                                                            const missedBadge = getMissedSkillBadge(row.skillLotteryResults?.get(cs.skillId));
                                                            const spurtImpacts = row.debuffSpurtImpacts?.get(cs.skillId) ?? [];
                                                            const impactsByTarget = new Map<number, { name: string; estimatedDrain: number }>();
                                                            spurtImpacts.forEach(impact => {
                                                                const existing = impactsByTarget.get(impact.targetFrameOrder);
                                                                impactsByTarget.set(
                                                                    impact.targetFrameOrder,
                                                                    {
                                                                        name: impact.targetName,
                                                                        estimatedDrain: (existing?.estimatedDrain ?? 0) + impact.estimatedHpDrain,
                                                                    }
                                                                );
                                                            });
                                                            return (
                                                                <div key={cs.skillId} className="skill-item">
                                                                    <div className="skill-info">
                                                                        {skillDef?.iconId ? (
                                                                            <img
                                                                                src={AssetLoader.getSkillIcon(skillDef.iconId)}
                                                                                alt=""
                                                                                className="skill-icon"
                                                                            />
                                                                        ) : (
                                                                            <div className="skill-icon"></div>
                                                                        )}
                                                                        <span>{UMDatabaseWrapper.skillNameWithEnglishFallback(cs.skillId)}</span>
                                                                        {impactsByTarget.size > 0 && (
                                                                            <OverlayTrigger
                                                                                placement="top"
                                                                                overlay={
                                                                                    <Tooltip id={`debuff-spurt-${row.frameOrder}-${cs.skillId}`}>
                                                                                        {Array.from(impactsByTarget.entries()).map(([targetFrameOrder, impact]) => (
                                                                                            <div key={targetFrameOrder}>
                                                                                                This debuff affected the last spurt of {impact.name}.
                                                                                            </div>
                                                                                        ))}
                                                                                    </Tooltip>
                                                                                }
                                                                            >
                                                                                <img
                                                                                    src={AssetLoader.getBlockedIcon() ?? ""}
                                                                                    alt="Affected last spurt"
                                                                                    className="skill-spurt-impact-icon"
                                                                                />
                                                                            </OverlayTrigger>
                                                                        )}
                                                                    </div>
                                                                    {usedBadge ? (
                                                                        <span className={`skill-badge ${usedBadge.className}`} title={usedBadge.title}>
                                                                            {usedBadge.label}
                                                                        </span>
                                                                    ) : (
                                                                        <span className={`skill-badge ${missedBadge.className}`} title={missedBadge.title}>
                                                                            {missedBadge.label}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        });

                                                        return [header, ...items];
                                                    });
                                                })()}
                                            </div>
                                        </div>

                                        {/* Aptitudes & Deck Panel */}
                                        <div className="dashboard-panel panel-aptitudes">
                                            <div className="dashboard-panel-header">
                                                Aptitudes
                                            </div>
                                            <div className="aptitude-container">
                                                <CharaProperLabels
                                                    chara={row.trainedChara}
                                                    groundFilter={aptitudeFilters?.ground}
                                                    distanceFilter={aptitudeFilters?.distance}
                                                    runningStyleFilter={row.horseResultData.runningStyle}
                                                />
                                            </div>

                                            {row.deck && row.deck.length > 0 && (
                                                <>
                                                    <div className="dashboard-panel-header dashboard-panel-header--footer">
                                                        Support Deck
                                                    </div>
                                                    <div className="support-deck-grid">
                                                        {row.deck.map((card) => (
                                                            <div key={card.position} className="support-card-wrapper" title={`ID: ${card.id}`}>
                                                                <img
                                                                    src={AssetLoader.getSupportCardIcon(card.id) ?? ""}
                                                                    alt={String(card.id)}
                                                                    className="support-card-img"
                                                                    onError={(e) => {
                                                                        const target = e.target as HTMLImageElement;
                                                                        target.style.display = 'none';
                                                                        if (target.parentElement) {
                                                                            target.parentElement.innerText = String(card.id);
                                                                        }
                                                                    }}
                                                                />
                                                                <div className="support-card-lb">
                                                                    LB {card.lb}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* Inheritance Panel */}
                                        {(parentGroup1.length > 0 || parentGroup2.length > 0) && (
                                            <div className="dashboard-panel panel-inheritance">
                                                <div className="dashboard-panel-header">
                                                    Parents
                                                </div>
                                                <div className="parents-list">
                                                    <ParentGroup parents={parentGroup1} />
                                                    <ParentGroup parents={parentGroup2} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );

                        return [mainRow, expandedRow];
                    })}
                </tbody>
            </table>
            {selectedSkillRow && (
                <SkillBreakdownModal show={!!selectedSkillRow} onHide={() => setSelectedSkillRow(null)} charaData={selectedSkillRow} courseId={courseId} />
            )}
        </div>
    );
};

function formatPercent(value: number | undefined): string {
    return value === undefined ? "?" : `${value.toFixed(1)}%`;
}

function isGoldSkill(skillId: number): boolean {
    return getSkillDef(skillId)?.rarity === 2;
}

type SkillListGroupKey = "activated" | "failed-wit" | "failed-condition" | "not-activated";

type SkillListGroup = {
    key: SkillListGroupKey;
    label: string;
    skills: CharaSkill[];
};

const skillListGroupOrder: SkillListGroupKey[] = ["activated", "failed-wit", "failed-condition", "not-activated"];

const skillListGroupLabels: Record<SkillListGroupKey, string> = {
    "activated": "Activated",
    "failed-wit": "Failed wit check",
    "failed-condition": "Failed condition",
    "not-activated": "Not activated",
};

function buildSkillListGroups(row: CharaTableData): SkillListGroup[] {
    const grouped = new Map<SkillListGroupKey, CharaSkill[]>();
    skillListGroupOrder.forEach((key) => grouped.set(key, []));

    row.trainedChara.skills.forEach((skill) => {
        grouped.get(getSkillListGroup(row, skill))!.push(skill);
    });

    return skillListGroupOrder
        .map((key) => ({
            key,
            label: skillListGroupLabels[key],
            skills: grouped.get(key)!.sort(compareSkillsForBreakdown),
        }))
        .filter((group) => group.skills.length > 0);
}

function getSkillListGroup(row: CharaTableData, skill: CharaSkill): SkillListGroupKey {
    if (row.activatedSkillCounts.has(skill.skillId)) {
        return "activated";
    }

    const lotteryResult = row.skillLotteryResults?.get(skill.skillId);
    if (lotteryResult?.category === "LOTTERY_FAILED" && !lotteryResult.retriggered) {
        return "failed-wit";
    }

    if (lotteryResult?.category === "WON_NOT_TRIGGERED" || lotteryResult?.category === "GUARANTEED_NOT_TRIGGERED") {
        return "failed-condition";
    }

    return "not-activated";
}

function compareSkillsForBreakdown(a: CharaSkill, b: CharaSkill): number {
    const aDef = getSkillDef(a.skillId);
    const bDef = getSkillDef(b.skillId);
    return (aDef?.iconId || 0) - (bDef?.iconId || 0) || a.skillId - b.skillId;
}

function getUsedSkillBadge(skillId: number, count: number, lotteryResult: SkillLotteryResult | undefined): { label: string; className: string; title?: string } {
    if (count > 1) {
        return {
            label: `${count}x Used`,
            className: "multiple",
        };
    }

    if (isGoldSkill(skillId) && lotteryResult?.triggeredBy564) {
        return {
            label: "564",
            className: "",
            title: "Activated by 564 Escapades.",
        };
    }

    return {
        label: "Used",
        className: "",
    };
}

function getMissedSkillBadge(lotteryResult: SkillLotteryResult | undefined): { label: string; className: string; title: string } {
    if (!lotteryResult) {
        return {
            label: "✕",
            className: "failed",
            title: "Skill did not activate.",
        };
    }

    if (lotteryResult.category === "LOTTERY_FAILED" && !lotteryResult.retriggered) {
        return {
            label: "✕",
            className: "failed failed-wit",
            title: `Failed wit check. Roll ${formatPercent(lotteryResult.roll)} vs activation chance ${formatPercent(lotteryResult.perThreshold)}.`,
        };
    }

    if (lotteryResult.category === "WON_NOT_TRIGGERED") {
        return {
            label: "✕",
            className: "failed failed-condition",
            title: `Passed wit check. Roll ${formatPercent(lotteryResult.roll)} vs activation chance ${formatPercent(lotteryResult.perThreshold)}, but the activation condition was not met.`,
        };
    }

    if (lotteryResult.category === "GUARANTEED_NOT_TRIGGERED") {
        return {
            label: "✕",
            className: "failed failed-condition",
            title: "No wit check required; the activation condition was not met.",
        };
    }

    return {
        label: "✕",
        className: "failed",
        title: "Skill did not activate.",
    };
}

export default CharaTable;
