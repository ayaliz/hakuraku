import React, { useState, useEffect, useMemo } from "react";
import { Nav, Spinner, Alert } from "react-bootstrap";
import { useSearchParams } from "react-router-dom";
import type {
    GateStatsMode,
    GateWinRateFlavor,
    SkillStats,
} from "../MultiRacePage/types";
import StrategyAnalysis from "../MultiRacePage/components/WinDistributionCharts/StrategyAnalysis";
import { COLORBLIND_STRATEGY_COLORS, STRATEGY_COLORS, STRATEGY_NAMES, STRATEGY_DISPLAY_ORDER } from "../MultiRacePage/components/WinDistributionCharts/constants";
import CharacterAnalysis from "../MultiRacePage/components/WinDistributionCharts/CharacterAnalysis";
import SkillAnalysis from "../MultiRacePage/components/SkillAnalysis";
import Histogram from "./Histogram";
import UmaFeatCard from "./FastestUmaPanel";
import { formatTime } from "../../data/UMDatabaseUtils";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import AssetLoader from "../../data/AssetLoader";
import TrueSkillTeamPanel from "./TrueSkillTeamPanel";
import ExplorerTab from "./ExplorerTab";
import ReplaysTab from "./ReplaysTab";
import InfoTooltip from "../MultiRacePage/components/WinDistributionCharts/InfoTooltip";
import type { GroupSkillDetailPayload } from "./skillCache";
import type {
    GroupDeckData,
    GroupPanelData,
    GroupSkillDetailResponse,
    GroupSkillOverviewResponse,
    Manifest,
    Section,
    TrackGroup,
    TrackGroupContentProps,
    UmaLogsData,
} from "./umaLogsTypes";
import {
    PANEL_DATA_SECTIONS,
    UMA_LOGS_SECTIONS,
} from "./umaLogsTypes";
import { deserializeHorseEntry, deserializeSkillOverviewStats, deserializeStats } from "./deserialize";
import CardUsageModal from "./CardUsageModal";
import SkillsByStrategyModal from "./SkillsByStrategyModal";
import StyleDecksModal from "./StyleDecksModal";
import "../MultiRacePage/MultiRacePage.css";
import "./UmaLogsPage.css";

const rawUmaLogsApiBase = (import.meta.env.VITE_UMALOGS_API_BASE ?? "").trim();
const UMA_LOGS_API_BASE = rawUmaLogsApiBase === "same-origin"
    || rawUmaLogsApiBase.length === 0
    ? ""
    : rawUmaLogsApiBase.replace(/\/$/, "");

const TrackGroupContent: React.FC<TrackGroupContentProps> = ({ group, cmId, cmLabel, section, onSectionChange, scoreWinnersOnly, setScoreWinnersOnly, totalRaces, strategyColors }) => {
    const [cardUsageOpen, setCardUsageOpen] = useState(false);
    const [styleDecksOpen, setStyleDecksOpen] = useState(false);
    const [skillsOpen, setSkillsOpen] = useState(false);
    const [skillsStrategyTab, setSkillsStrategyTab] = useState<number>(1);
    const [skillsSort, setSkillsSort] = useState<"pop" | "winRate">("pop");
    const [skillsMinPopPct, setSkillsMinPopPct] = useState<0 | 0.5 | 1 | 2>(0.5);
    const [deckModalTab, setDeckModalTab] = useState<"overview" | "decks">("overview");
    const [styleDeckSort, setStyleDeckSort] = useState<"pop" | "winRate">("pop");
    const [styleDeckMinPopPct, setStyleDeckMinPopPct] = useState<0 | 0.5 | 1 | 2>(0.5);
    const [gateMode, setGateMode] = useState<GateStatsMode>('winRate');
    const [gateFlavor, setGateFlavor] = useState<GateWinRateFlavor>('total');
    const [panelData, setPanelData] = useState<GroupPanelData | null>(null);
    const [panelDataLoading, setPanelDataLoading] = useState(false);
    const [panelDataError, setPanelDataError] = useState<string | null>(null);
    const [deckData, setDeckData] = useState<GroupDeckData | null>(null);
    const [deckDataLoading, setDeckDataLoading] = useState(false);
    const [deckDataError, setDeckDataError] = useState<string | null>(null);
    const [skillOverview, setSkillOverview] = useState<Map<number, SkillStats> | null>(null);
    const [skillOverviewLoading, setSkillOverviewLoading] = useState(false);
    const [skillOverviewError, setSkillOverviewError] = useState<string | null>(null);
    const [skillDetailCache, setSkillDetailCache] = useState<Map<number, GroupSkillDetailPayload>>(new Map());
    const [skillDetailLoadingIds, setSkillDetailLoadingIds] = useState<Set<number>>(new Set());

    const sectionNeedsPanelData = PANEL_DATA_SECTIONS.includes(section);
    const sectionNeedsSkillOverview = section === 'skill';
    const shouldFetchPanelData = sectionNeedsPanelData;
    const shouldFetchDeckData = styleDecksOpen;
    const panelDataUnavailable = sectionNeedsPanelData && !panelData;
    const deckDataUnavailable = styleDecksOpen && !deckData;
    const skillDataUnavailable = section === 'skill' && !skillOverview;

    useEffect(() => {
        setPanelData(null);
        setPanelDataLoading(false);
        setPanelDataError(null);
        setDeckData(null);
        setDeckDataLoading(false);
        setDeckDataError(null);
        setSkillOverview(null);
        setSkillOverviewLoading(false);
        setSkillOverviewError(null);
        setSkillDetailCache(new Map());
        setSkillDetailLoadingIds(new Set());
    }, [cmId, group.courseId]);

    useEffect(() => {
        if (!shouldFetchPanelData || !cmId || panelData !== null || panelDataLoading) return;

        const controller = new AbortController();
        setPanelDataLoading(true);
        setPanelDataError(null);
        fetch(`${UMA_LOGS_API_BASE}/api/umalogs/${encodeURIComponent(cmId)}/groups/${group.courseId}/panel-data`, {
            signal: controller.signal,
        })
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status} - group panel data not found`);
                return r.json() as Promise<GroupPanelData>;
            })
            .then((json) => {
                setPanelData(json);
                setPanelDataLoading(false);
            })
            .catch((err: Error) => {
                if (err.name === "AbortError") return;
                setPanelDataError(err.message);
                setPanelDataLoading(false);
            });

        return () => controller.abort();
    }, [cmId, group.courseId, panelData, shouldFetchPanelData]);

    useEffect(() => {
        if (!shouldFetchDeckData || !cmId || deckData !== null || deckDataLoading) return;

        const controller = new AbortController();
        setDeckDataLoading(true);
        setDeckDataError(null);
        fetch(`${UMA_LOGS_API_BASE}/api/umalogs/${encodeURIComponent(cmId)}/groups/${group.courseId}/deck-data`, {
            signal: controller.signal,
        })
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status} - group deck data not found`);
                return r.json() as Promise<GroupDeckData>;
            })
            .then((json) => {
                setDeckData(json);
                setDeckDataLoading(false);
            })
            .catch((err: Error) => {
                if (err.name === "AbortError") return;
                setDeckDataError(err.message);
                setDeckDataLoading(false);
            });

        return () => controller.abort();
    }, [cmId, deckData, group.courseId, shouldFetchDeckData]);

    useEffect(() => {
        if (!sectionNeedsSkillOverview || !cmId || skillOverview !== null || skillOverviewLoading) return;

        const controller = new AbortController();
        setSkillOverviewLoading(true);
        setSkillOverviewError(null);
        fetch(`${UMA_LOGS_API_BASE}/api/umalogs/${encodeURIComponent(cmId)}/groups/${group.courseId}/skills`, {
            signal: controller.signal,
        })
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status} - group skill data not found`);
                return r.json() as Promise<GroupSkillOverviewResponse>;
            })
            .then((json) => {
                setSkillOverview(deserializeSkillOverviewStats(json.skillStats));
                setSkillOverviewLoading(false);
            })
            .catch((err: Error) => {
                if (err.name === "AbortError") return;
                setSkillOverviewError(err.message);
                setSkillOverviewLoading(false);
            });

        return () => controller.abort();
    }, [cmId, group.courseId, sectionNeedsSkillOverview, skillOverview]);

    const loadSkillDetail = (skillId: number) => {
        if (!cmId || skillDetailCache.has(skillId) || skillDetailLoadingIds.has(skillId)) return;
        setSkillDetailLoadingIds((prev) => {
            const next = new Set(prev);
            next.add(skillId);
            return next;
        });
        fetch(`${UMA_LOGS_API_BASE}/api/umalogs/${encodeURIComponent(cmId)}/groups/${group.courseId}/skills/${skillId}`)
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status} - skill detail not found`);
                return r.json() as Promise<GroupSkillDetailResponse>;
            })
            .then((json) => {
                setSkillDetailCache((prev) => {
                    const next = new Map(prev);
                    next.set(skillId, {
                        buckets: json.buckets,
                        winBreakdown: json.winBreakdown,
                    });
                    return next;
                });
            })
            .catch((err: Error) => {
                setSkillOverviewError(err.message);
            })
            .finally(() => {
                setSkillDetailLoadingIds((prev) => {
                    const next = new Set(prev);
                    next.delete(skillId);
                    return next;
                });
            });
    };

    const fastestWin = deserializeHorseEntry(panelData?.topHorses.fastestWin);
    const slowestWin = deserializeHorseEntry(panelData?.topHorses.slowestWin);
    const highestWinner = deserializeHorseEntry(panelData?.topHorses.highestWinner);
    const lowestWinner = deserializeHorseEntry(panelData?.topHorses.lowestWinner);
    const winningTimeHistogram = panelData?.winningTimeHistogram ?? null;
    const scoreHistogram = scoreWinnersOnly
        ? (panelData?.scoreHistogramWinners ?? null)
        : (panelData?.scoreHistogramAll ?? null);
    const styleReps = panelData?.styleReps ?? {};

    const skillIconMap = useMemo<Map<number, number>>(() => {
        const map = new Map<number, number>();
        for (const [id, s] of Object.entries(UMDatabaseWrapper.skills)) {
            if (s.iconId) map.set(+id, s.iconId);
        }
        return map;
    }, []);
    const getSkillIconUrl = (id: number) => {
        const resolved = id >= 900000 && id < 1000000 ? parseInt("1" + String(id).slice(1), 10) : id;
        const iconId = skillIconMap.get(resolved);
        return iconId ? AssetLoader.getSkillIcon(iconId) : null;
    };

    const skillsByStrategy = panelData?.skillsByStrategy ?? {};

    const rawUnifiedCharacterWinsAll = panelData?.rawUnifiedCharacterWinsAll ?? [];
    const rawUnifiedCharacterWinsOpp = panelData?.rawUnifiedCharacterWinsOpp ?? [];
    const rawUnifiedCharacterPop = panelData?.rawUnifiedCharacterPop ?? [];
    const gateFlavorLabels: Record<GateWinRateFlavor, string> = {
        total: 'Total',
        front: 'Front',
        pace: 'Pace',
        late: 'Late',
        end: 'End',
    };
    const gateModeLabels: Record<GateStatsMode, string> = {
        winRate: 'Win Rate',
        blocked: 'Blocked',
        dodgingDanger: 'Dodging Danger',
    };
    const displayedGateWinRates = group.stats.gateStats.winRatesByFlavor[gateFlavor] ?? [];
    const displayedBlockedRates = group.stats.gateStats.blockedRatesByFlavor[gateFlavor] ?? [];
    const displayedDodgingDangerRates = group.stats.gateStats.dodgingDangerRates ?? [];
    const gateWinBaseline = useMemo(() => {
        const totals = group.stats.gateStats.winRatesByFlavor.total.reduce((acc, gate) => {
            acc.wins += gate.wins;
            acc.appearances += gate.appearances;
            return acc;
        }, { wins: 0, appearances: 0 });
        return totals.appearances > 0 ? totals.wins / totals.appearances : 1 / 9;
    }, [group.stats.gateStats.winRatesByFlavor]);
    const gateModeBaseline = useMemo(() => {
        if (gateMode === 'blocked') {
            const totals = displayedBlockedRates.reduce((acc, gate) => {
                acc.blocked += gate.blockedCount;
                acc.appearances += gate.appearances;
                return acc;
            }, { blocked: 0, appearances: 0 });
            return totals.appearances > 0 ? totals.blocked / totals.appearances : 0;
        }
        if (gateMode === 'dodgingDanger') {
            const totals = displayedDodgingDangerRates.reduce((acc, gate) => {
                acc.activations += gate.activations;
                acc.opportunities += gate.opportunities;
                return acc;
            }, { activations: 0, opportunities: 0 });
            return totals.opportunities > 0 ? totals.activations / totals.opportunities : 0;
        }
        const totals = displayedGateWinRates.reduce((acc, gate) => {
            acc.wins += gate.wins;
            acc.appearances += gate.appearances;
            return acc;
        }, { wins: 0, appearances: 0 });
        return totals.appearances > 0 ? totals.wins / totals.appearances : gateWinBaseline;
    }, [displayedBlockedRates, displayedDodgingDangerRates, displayedGateWinRates, gateMode, gateWinBaseline]);
    const gateRateColor = (value: number, baseline: number, invert = false) => {
        const rawDelta = value - baseline;
        const delta = invert ? -rawDelta : rawDelta;
        const t = Math.min(Math.abs(delta) / 0.03, 1);
        const from = [203, 213, 224];
        const to = delta >= 0 ? [104, 211, 145] : [252, 129, 129];
        const r = Math.round(from[0] + (to[0] - from[0]) * t);
        const g = Math.round(from[1] + (to[1] - from[1]) * t);
        const b = Math.round(from[2] + (to[2] - from[2]) * t);
        return `rgb(${r}, ${g}, ${b})`;
    };
    const gateGridColumns = gateMode === 'winRate' ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr';
    const hasGateStats =
        group.stats.gateStats.winRatesByFlavor.total.length > 0 ||
        group.stats.gateStats.blockedRatesByFlavor.total.length > 0 ||
        group.stats.gateStats.dodgingDangerRates.length > 0;
    const availableDeckStyleIds = useMemo(() => {
        if (deckData) {
            return Object.keys(deckData.styleDeckRowsByStyle).map(Number).sort((a, b) => a - b);
        }
        return [];
    }, [deckData]);
    const [selectedDeckStyle, setSelectedDeckStyle] = useState<number>(availableDeckStyleIds[0] ?? 1);
    useEffect(() => {
        if (!availableDeckStyleIds.includes(selectedDeckStyle)) {
            setSelectedDeckStyle(availableDeckStyleIds[0] ?? 1);
        }
    }, [availableDeckStyleIds, selectedDeckStyle]);
    useEffect(() => {
        if (gateMode === 'dodgingDanger' && gateFlavor !== 'front') {
            setGateFlavor('front');
        }
    }, [gateFlavor, gateMode]);
    const raceBonusRows = panelData?.raceBonusRows ?? [];

    const styleDeckRowsByStyle = deckData?.styleDeckRowsByStyle ?? {};
    const selectedStyleDeckRows = styleDeckRowsByStyle[selectedDeckStyle] ?? [];
    const effectiveStyleDeckMinPopPct = styleDeckSort === "pop" ? 0 : styleDeckMinPopPct;
    const filteredStyleDeckRows = useMemo(
        () => selectedStyleDeckRows.filter(r => r.popPct >= effectiveStyleDeckMinPopPct),
        [selectedStyleDeckRows, effectiveStyleDeckMinPopPct]
    );
    const selectedStyleDeckList = useMemo(() => {
        if (styleDeckSort === "pop") return [...filteredStyleDeckRows].sort((a, b) => b.appearances - a.appearances);
        return [...filteredStyleDeckRows].sort((a, b) => b.adjWinRate - a.adjWinRate);
    }, [filteredStyleDeckRows, styleDeckSort]);
    const selectedStyleDeckMaxPct = useMemo(
        () => Math.max(...selectedStyleDeckList.slice(0, 20).flatMap(r => [r.popPct, r.adjWinRate * 100]), 1),
        [selectedStyleDeckList]
    );

    return (
        <>
            <Nav variant="tabs" className="uma-section-nav">
                {UMA_LOGS_SECTIONS.map((s) => (
                    <Nav.Item key={s}>
                        <Nav.Link
                            active={section === s}
                            onClick={() => onSectionChange(s)}
                            className="uma-section-link"
                        >
                            {s === 'introduction' ? 'Introduction' :
                                s === 'overview' ? 'Overview' :
                                    s === 'strategy' ? 'Strategy Analysis' :
                                        s === 'character' ? 'Character Analysis' :
                                            s === 'skill' ? 'Skill Analysis' :
                                                s === 'explorer' ? 'Explorer' : 'Replays'}
                        </Nav.Link>
                    </Nav.Item>
                ))}
            </Nav>

            {section === 'introduction' && (
                <div className="uma-intro-tab">
                    <p>
                        Welcome to the public room data page, aka UmaLogs.
                        It currently serves stats for <strong>{totalRaces.toLocaleString()}</strong> total{' '}
                        {cmLabel} room matches.
                    </p>
                    <h5>Adjusted Win Rates</h5>
                    <p>
                        In many places you'll see references to adjusted win rates over raw win rates.
                        To prevent umas or teams with very low representation in the data from dominating
                        win rate leaderboards - for example, something like 3 wins in 4 appearances
                        counting as a 75% win rate and appearing above popular, strong umas that scored
                        below 75% - the Bayesian average is used:
                    </p>
                    <ul>
                        <li>Per-uma data: prior m = 1/9, C = 54</li>
                        <li>Per-team data: prior m = 1/3, C = 18</li>
                        <li>Per-skill win rates: prior m = uma's base win rate in the data, C = 54</li>
                    </ul>
                </div>
            )}

            {panelDataError && panelDataUnavailable && (
                <Alert variant="warning" className="mt-3">
                    <strong>Panel data not available.</strong>
                    <br />
                    <small className="text-muted">{panelDataError}</small>
                </Alert>
            )}

            {panelDataLoading && panelDataUnavailable && (
                <div className="p-4 text-center">
                    <Spinner animation="border" /> Loading panel data...
                </div>
            )}

            {skillOverviewError && skillDataUnavailable && (
                <Alert variant="warning" className="mt-3">
                    <strong>Skill data not available.</strong>
                    <br />
                    <small className="text-muted">{skillOverviewError}</small>
                </Alert>
            )}

            {skillOverviewLoading && skillDataUnavailable && (
                <div className="p-4 text-center">
                    <Spinner animation="border" /> Loading skill data...
                </div>
            )}

            {!panelDataUnavailable && section === 'overview' && (
                <div className="uma-overview-tab">
                    <div className="uma-stats-top">
                        <div className="uma-overview-main">
                            <div className="uma-overview-left">
                                <div className="uma-win-row">
                                    <Histogram
                                        data={winningTimeHistogram}
                                        title="Winning Time Distribution"
                                        formatX={(v) => {
                                            const m = Math.floor(v / 60);
                                            const s = v - m * 60;
                                            return `${m}:${s.toFixed(2).padStart(5, "0")}`;
                                        }}
                                        xAxisLabel="Finish time (M:SS.ss)"
                                        tooltipUnit="race"
                                    />
                                </div>
                                <div className="uma-score-row">
                                    <Histogram
                                        data={scoreHistogram}
                                        title="Score Distribution"
                                        formatX={(v) => Math.round(v).toLocaleString()}
                                        xAxisLabel="Score"
                                        barColor="#68d391"
                                        tooltipUnit="entry"
                                        headerRight={
                                            <div className="histogram-toggle">
                                                <button
                                                    className={`histogram-toggle-btn${!scoreWinnersOnly ? " active" : ""}`}
                                                    onClick={() => setScoreWinnersOnly(false)}
                                                >
                                                    All
                                                </button>
                                                <button
                                                    className={`histogram-toggle-btn${scoreWinnersOnly ? " active" : ""}`}
                                                    onClick={() => setScoreWinnersOnly(true)}
                                                >
                                                    Winners
                                                </button>
                                            </div>
                                        }
                                    />
                                </div>
                            </div>
                            {(fastestWin || slowestWin || highestWinner || lowestWinner) && (
                                <div className="uma-overview-mid">
                                    <div className="uma-overview-cards-grid">
                                        {fastestWin && (
                                            <UmaFeatCard
                                                horse={fastestWin}
                                                label="Fastest Win"
                                                displayValue={formatTime(fastestWin.finishTime)}
                                                skillStats={group.stats.skillStats}
                                                strategyColors={strategyColors}
                                            />
                                        )}
                                        {slowestWin && (
                                            <UmaFeatCard
                                                horse={slowestWin}
                                                label="Slowest Win"
                                                displayValue={formatTime(slowestWin.finishTime)}
                                                skillStats={group.stats.skillStats}
                                                strategyColors={strategyColors}
                                            />
                                        )}
                                        {highestWinner && (
                                            <UmaFeatCard
                                                horse={highestWinner}
                                                label="Highest Winner"
                                                displayValue={highestWinner.rankScore.toLocaleString()}
                                                displayValueColor="#68d391"
                                                showRankIcon
                                                skillStats={group.stats.skillStats}
                                                strategyColors={strategyColors}
                                            />
                                        )}
                                        {lowestWinner && (
                                            <UmaFeatCard
                                                horse={lowestWinner}
                                                label="Lowest Winner"
                                                displayValue={lowestWinner.rankScore.toLocaleString()}
                                                displayValueColor="#68d391"
                                                showRankIcon
                                                skillStats={group.stats.skillStats}
                                                strategyColors={strategyColors}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}
                            {hasGateStats && (
                                <div className="uma-gate-panel">
                            <div className="uma-gate-panel-title">
                                Gate Stats
                                <InfoTooltip
                                    id="gate-stats-info"
                                    tip="Runaway is included in Front."
                                />
                            </div>
                                    <div className="histogram-toggle uma-gate-toggle">
                                        {(Object.keys(gateModeLabels) as GateStatsMode[]).map((mode) => (
                                            <button
                                                key={mode}
                                                className={`histogram-toggle-btn uma-gate-toggle-btn${gateMode === mode ? " active" : ""}`}
                                                onClick={() => setGateMode(mode)}
                                            >
                                                {gateModeLabels[mode]}
                                            </button>
                                        ))}
                                    </div>
                                    {(gateMode === 'winRate' || gateMode === 'blocked' || gateMode === 'dodgingDanger') && (
                                        <div className="histogram-toggle uma-gate-toggle">
                                            {(Object.keys(gateFlavorLabels) as GateWinRateFlavor[]).map((flavor) => {
                                                const disabled = gateMode === 'dodgingDanger' && flavor !== 'front';
                                                return (
                                                    <button
                                                        key={flavor}
                                                        className={`histogram-toggle-btn uma-gate-toggle-btn${gateFlavor === flavor ? " active" : ""}`}
                                                        onClick={() => !disabled && setGateFlavor(flavor)}
                                                        disabled={disabled}
                                                    >
                                                        {gateFlavorLabels[flavor]}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div className="uma-gate-table-wrap">
                                        {gateMode === 'winRate' && (
                                            <>
                                                <div className="uma-gate-head-row" style={{ gridTemplateColumns: gateGridColumns }}>
                                                    <div>Gate</div>
                                                    <div className="uma-gate-cell--r">Wins</div>
                                                    <div className="uma-gate-cell--r">Entries</div>
                                                    <div className="uma-gate-cell--r">Win%</div>
                                                </div>
                                                <div className="uma-gate-body">
                                                    {displayedGateWinRates.map((gate) => (
                                                        <div key={gate.gateNumber} className="uma-gate-body-row" style={{ gridTemplateColumns: gateGridColumns }}>
                                                            <div>{gate.gateNumber}</div>
                                                            <div className="uma-gate-cell--r">{gate.wins}</div>
                                                            <div className="uma-gate-cell--r">{gate.appearances}</div>
                                                            <div className="uma-gate-cell--r" style={{ color: gateRateColor(gate.winRate, gateModeBaseline) }}>
                                                                {(gate.winRate * 100).toFixed(1)}%
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {displayedGateWinRates.length === 0 && (
                                                        <div className="uma-gate-body-row" style={{ gridTemplateColumns: gateGridColumns }}>
                                                            <div className="uma-gate-no-data-wide">
                                                                No data
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                        {gateMode === 'blocked' && (
                                            <>
                                                <div className="uma-gate-head-row" style={{ gridTemplateColumns: gateGridColumns }}>
                                                    <div>Gate</div>
                                                    <div className="uma-gate-cell--r">Blocked%</div>
                                                    <div className="uma-gate-cell--r">Win% after block</div>
                                                </div>
                                                <div className="uma-gate-body">
                                                    {displayedBlockedRates.map((gate) => (
                                                        <div key={gate.gateNumber} className="uma-gate-body-row" style={{ gridTemplateColumns: gateGridColumns }}>
                                                            <div>{gate.gateNumber}</div>
                                                            <div className="uma-gate-cell--r" style={{ color: gateRateColor(gate.blockedRate, gateModeBaseline, true) }}>
                                                                {(gate.blockedRate * 100).toFixed(1)}%
                                                            </div>
                                                            <div className="uma-gate-cell--r" style={{ color: gateRateColor(gate.winRateAfterBlock, gateWinBaseline) }}>
                                                                {(gate.winRateAfterBlock * 100).toFixed(1)}%
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {displayedBlockedRates.length === 0 && (
                                                        <div className="uma-gate-body-row" style={{ gridTemplateColumns: gateGridColumns }}>
                                                            <div className="uma-gate-no-data">
                                                                No data
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                        {gateMode === 'dodgingDanger' && (
                                            <>
                                                <div className="uma-gate-head-row" style={{ gridTemplateColumns: gateGridColumns }}>
                                                    <div>Gate</div>
                                                    <div className="uma-gate-cell--r">Activation%</div>
                                                    <div className="uma-gate-cell--r">Win% after activation</div>
                                                </div>
                                                <div className="uma-gate-body">
                                                    {displayedDodgingDangerRates.map((gate) => (
                                                        <div key={gate.gateNumber} className="uma-gate-body-row" style={{ gridTemplateColumns: gateGridColumns }}>
                                                            <div>{gate.gateNumber}</div>
                                                            <div className="uma-gate-cell--r" style={{ color: gateRateColor(gate.activationRate, gateModeBaseline) }}>
                                                                {(gate.activationRate * 100).toFixed(1)}%
                                                            </div>
                                                            <div className="uma-gate-cell--r" style={{ color: gateRateColor(gate.winRateAfterActivation, gateWinBaseline) }}>
                                                                {(gate.winRateAfterActivation * 100).toFixed(1)}%
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {displayedDodgingDangerRates.length === 0 && (
                                                        <div className="uma-gate-body-row" style={{ gridTemplateColumns: gateGridColumns }}>
                                                            <div className="uma-gate-no-data">
                                                                No data
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="uma-overview-actions">
                            <button className="ca-decks-btn uma-overview-action-btn" onClick={() => setStyleDecksOpen(true)} title="View style support decks">
                                <img src={AssetLoader.getStatIcon("deck")} alt="" className="ca-decks-btn-icon" />
                                View decks
                            </button>
                            <button className="ca-decks-btn uma-overview-action-btn" onClick={() => setCardUsageOpen(true)}>
                                <img src={`${import.meta.env.BASE_URL}assets/textures/card.webp`} alt="" className="ca-decks-btn-icon" />
                                View card usage
                            </button>
                            <button className="ca-decks-btn uma-overview-action-btn" onClick={() => setSkillsOpen(true)}>
                                <img src={`${import.meta.env.BASE_URL}assets/textures/skills.webp`} alt="" className="ca-decks-btn-icon" />
                                View skills
                            </button>
                        </div>
                        {group.stats.trueskillRanking && group.stats.trueskillRanking.length > 0 && (
                            <TrueSkillTeamPanel
                                variant="trueskill"
                                ranking={group.stats.trueskillRanking}
                                skillStats={group.stats.skillStats}
                            />
                        )}
                        {group.stats.empiricalBayesRanking && group.stats.empiricalBayesRanking.length > 0 && (
                            <TrueSkillTeamPanel
                                variant="empiricalBayes"
                                ranking={group.stats.empiricalBayesRanking}
                                skillStats={group.stats.skillStats}
                            />
                        )}
                    </div>
                </div>
            )}
            <CardUsageModal
                open={cardUsageOpen}
                onClose={() => setCardUsageOpen(false)}
                rows={panelData?.supportCardRows}
            />
            <SkillsByStrategyModal
                open={skillsOpen}
                onClose={() => setSkillsOpen(false)}
                skillsByStrategy={skillsByStrategy}
                skillsStrategyTab={skillsStrategyTab}
                setSkillsStrategyTab={setSkillsStrategyTab}
                skillsSort={skillsSort}
                setSkillsSort={setSkillsSort}
                skillsMinPopPct={skillsMinPopPct}
                setSkillsMinPopPct={setSkillsMinPopPct}
                getSkillIconUrl={getSkillIconUrl}
            />
            <StyleDecksModal
                open={styleDecksOpen}
                onClose={() => setStyleDecksOpen(false)}
                deckDataLoading={deckDataLoading}
                deckDataUnavailable={deckDataUnavailable}
                deckDataError={deckDataError}
                deckModalTab={deckModalTab}
                setDeckModalTab={setDeckModalTab}
                raceBonusRows={raceBonusRows}
                availableDeckStyleIds={availableDeckStyleIds}
                selectedDeckStyle={selectedDeckStyle}
                setSelectedDeckStyle={setSelectedDeckStyle}
                styleDeckSort={styleDeckSort}
                setStyleDeckSort={setStyleDeckSort}
                styleDeckMinPopPct={styleDeckMinPopPct}
                setStyleDeckMinPopPct={setStyleDeckMinPopPct}
                selectedStyleDeckList={selectedStyleDeckList}
                selectedStyleDeckMaxPct={selectedStyleDeckMaxPct}
            />

            {!panelDataUnavailable && section === 'strategy' && (
                <div className="win-distribution-section">
                    <StrategyAnalysis
                        cmId={cmId}
                        courseId={group.courseId}
                        apiBase={UMA_LOGS_API_BASE}
                        apiMode
                        strategyStats={group.stats.strategyStats}
                        totalRaces={group.stats.totalRaces}
                        roomCompositions={group.stats.roomCompositions}
                        styleCompositionRows={panelData?.styleCompositionRows ?? []}
                        styleReps={styleReps}
                        characterTeamRates={panelData?.characterTeamRates ?? []}
                        skillStats={group.stats.skillStats}
                        strategyColors={strategyColors}
                    />
                </div>
            )}

            {!panelDataUnavailable && section === 'character' && (
                <div className="win-distribution-section">
                    <CharacterAnalysis
                        cmId={cmId}
                        courseId={group.courseId}
                        apiBase={UMA_LOGS_API_BASE}
                        apiMode
                        rawWinsAll={rawUnifiedCharacterWinsAll}
                        rawWinsOpp={rawUnifiedCharacterWinsOpp}
                        rawPop={rawUnifiedCharacterPop}
                        spectatorMode
                        characterStats={group.stats.characterStats}
                        skillStats={group.stats.skillStats}
                        characterTeamRates={panelData?.characterTeamRates ?? []}
                        strategyColors={strategyColors}
                    />
                </div>
            )}

            {!skillDataUnavailable && section === 'skill' && (
                <SkillAnalysis
                    skillStats={skillOverview ?? group.stats.skillStats}
                    skillActivations={group.stats.skillActivations}
                    avgRaceDistance={group.stats.avgRaceDistance}
                    characterStats={group.stats.characterStats}
                    strategyStats={group.stats.strategyStats}
                    ownCharas={[]}
                    precomputedBuckets={skillOverview ? undefined : group.stats.skillActivationBuckets}
                    lazySkillDetails={skillOverview ? skillDetailCache : undefined}
                    onLoadLazySkillDetail={skillOverview ? loadSkillDetail : undefined}
                    lazySkillDetailLoadingIds={skillOverview ? skillDetailLoadingIds : undefined}
                />
            )}

            {section === 'explorer' && (
                <ExplorerTab
                    cmId={cmId}
                    courseId={group.courseId}
                    apiBase={UMA_LOGS_API_BASE}
                    apiMode
                    skillStats={group.stats.skillStats}
                    strategyColors={strategyColors}
                />
            )}

            {section === 'replays' && (
                <ReplaysTab
                    cmId={cmId}
                    courseId={group.courseId}
                    apiBase={UMA_LOGS_API_BASE}
                    strategyColors={strategyColors}
                />
            )}

        </>
    );
};

const UmaLogsPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [manifest, setManifest] = useState<Manifest | null>(null);
    const [manifestError, setManifestError] = useState<string | null>(null);
    const [selectedCmId, setSelectedCmId] = useState<string | null>(null);
    const [loadedDataset, setLoadedDataset] = useState<{ cmId: string; data: UmaLogsData } | null>(null);
    const [loadingCmId, setLoadingCmId] = useState<string | null>(null);
    const [datasetError, setDatasetError] = useState<string | null>(null);
    const [scoreWinnersOnly, setScoreWinnersOnly] = useState(false);
    const [colorblindMode, setColorblindMode] = useState(false);
    const tabParam = searchParams.get("tab");
    const section: Section = UMA_LOGS_SECTIONS.includes(tabParam as Section)
        ? (tabParam as Section)
        : "introduction";

    const handleSectionChange = (nextSection: Section) => {
        if (nextSection === section) return;
        const nextParams = new URLSearchParams(searchParams);
        if (nextSection === "introduction") {
            nextParams.delete("tab");
        } else {
            nextParams.set("tab", nextSection);
        }
        setSearchParams(nextParams, { replace: false });
    };

    useEffect(() => {
        const stored = localStorage.getItem("umalogsColorblindMode");
        if (stored === "1") setColorblindMode(true);
    }, []);

    useEffect(() => {
        localStorage.setItem("umalogsColorblindMode", colorblindMode ? "1" : "0");
    }, [colorblindMode]);

    useEffect(() => {
        fetch(`${UMA_LOGS_API_BASE}/api/umalogs/manifest`)
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status} - manifest not found`);
                return r.json() as Promise<Manifest>;
            })
            .then((m) => {
                setManifest(m);
                // Auto-select the latest dataset (last in the list).
                const latest = m.datasets[m.datasets.length - 1];
                if (latest) setSelectedCmId(latest.cmId);
            })
            .catch((err: Error) => setManifestError(err.message));
    }, []);

    // Lazy-load only the currently selected dataset and release the previous one.
    useEffect(() => {
        if (!selectedCmId) {
            setLoadedDataset(null);
            setLoadingCmId(null);
            return;
        }
        if (loadedDataset?.cmId === selectedCmId) {
            setLoadingCmId(null);
            return;
        }
        const controller = new AbortController();
        setLoadingCmId(selectedCmId);
        setDatasetError(null);
        setLoadedDataset(null);
        const request = fetch(`${UMA_LOGS_API_BASE}/api/umalogs/${encodeURIComponent(selectedCmId)}/summary`, { signal: controller.signal })
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status} - summary not found`);
                return r.json() as Promise<UmaLogsData>;
            });
        request
            .then((json) => {
                setLoadedDataset({ cmId: selectedCmId, data: json });
                setLoadingCmId(null);
            })
            .catch((err: Error) => {
                if (err.name === "AbortError") return;
                setDatasetError(err.message);
                setLoadingCmId(null);
            });
        return () => controller.abort();
    }, [selectedCmId, loadedDataset?.cmId]);

    const handleSelectCm = (newCmId: string) => {
        if (newCmId === selectedCmId) return;
        setLoadedDataset(null);
        setDatasetError(null);
        setSelectedCmId(newCmId);
    };

    const data = selectedCmId && loadedDataset?.cmId === selectedCmId ? loadedDataset.data : null;
    const loading = manifest === null || (selectedCmId !== null && (loadingCmId === selectedCmId || data === null));
    const error = manifestError ?? datasetError;

    const trackGroups: TrackGroup[] = useMemo(() => {
        if (!data) return [];
        return data.groups.map((g) => ({
            courseId: g.courseId,
            trackLabel: g.trackLabel,
            raceCount: g.raceCount,
            stats: deserializeStats(g.stats),
        }));
    }, [data]);

    const totalRaces = useMemo(() => data?.groups.reduce((s, g) => s + g.raceCount, 0) ?? 0, [data]);
    const generatedDate = data ? new Date(data.generatedAt).toLocaleDateString() : '';
    const cmLabel = manifest?.datasets.find((d) => d.cmId === selectedCmId)?.cmLabel
        ?? data?.cmLabel
        ?? (selectedCmId?.toUpperCase() ?? '');
    const strategyColors = colorblindMode ? COLORBLIND_STRATEGY_COLORS : STRATEGY_COLORS;

    if (loading) {
        return (
            <div className="p-4 text-center">
                <Spinner animation="border" /> Loading statistics...
            </div>
        );
    }

    if (error) {
        return (
            <Alert variant="warning" className="mt-4">
                <strong>Statistics not available.</strong> Run{' '}
                <code>yarn precompute</code> to generate them.
                <br />
                <small className="text-muted">{error}</small>
            </Alert>
        );
    }

    return (
        <div className="multirace-container">
            <div className="uma-page-header-row">
                <div className="mb-3 uma-page-header">
                    <strong>Room Match Statistics</strong>
                    {' | '}
                    {cmLabel}
                    {' | '}
                    {totalRaces} races
                    {' | '}
                    Updated {generatedDate}
                </div>
                <div className="uma-cm-selector">
                    <label className="uma-cm-label">
                        Dataset:
                        <select
                            className="uma-cm-select"
                            value={selectedCmId ?? ''}
                            onChange={(e) => handleSelectCm(e.target.value)}
                        >
                            {manifest?.datasets.map((d) => (
                                <option key={d.cmId} value={d.cmId}>
                                    {d.trackSummary ? `${d.cmLabel} - ${d.trackSummary}` : d.cmLabel}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <div className="uma-colorblind-controls">
                    <button
                        type="button"
                        className={`uma-colorblind-toggle${colorblindMode ? " is-on" : ""}`}
                        onClick={() => setColorblindMode(v => !v)}
                        aria-pressed={colorblindMode}
                    >
                        <span className="uma-colorblind-toggle-knob" />
                        <span className="uma-colorblind-toggle-label">Colorblind palette</span>
                        <span className="uma-colorblind-toggle-state">{colorblindMode ? "On" : "Off"}</span>
                    </button>
                    <div className="uma-colorblind-legend">
                        {STRATEGY_DISPLAY_ORDER.map((sid) => (
                            <span key={sid} className="uma-colorblind-legend-item">
                                <span
                                    className="uma-colorblind-legend-dot"
                                    style={{ background: strategyColors[sid] }}
                                />
                                {STRATEGY_NAMES[sid]}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {trackGroups.map((group) => (
                <TrackGroupContent
                    key={`${selectedCmId ?? "unknown"}:${group.courseId}`}
                    group={group}
                    cmId={selectedCmId}
                    cmLabel={cmLabel}
                    section={section}
                    onSectionChange={handleSectionChange}
                    scoreWinnersOnly={scoreWinnersOnly}
                    setScoreWinnersOnly={setScoreWinnersOnly}
                    totalRaces={totalRaces}
                    strategyColors={strategyColors}
                />
            ))}
        </div>
    );
};

export default UmaLogsPage;
