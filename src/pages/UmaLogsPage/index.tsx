import React, { useState, useEffect, useMemo } from "react";
import pako from "pako";
import { Nav, Spinner, Tab, Alert } from "react-bootstrap";
import type {
    AggregatedStats,
    CharacterStats,
    GateWinRateFlavor,
    GateWinRateStats,
    GateWinRateSplitStats,
    HorseEntry,
    PairSynergyStats,
    RoomCompositionEntry,
    SkillActivationBuckets,
    SkillStats,
    StrategyStats,
    TeamCompositionStats,
    TrueSkillTeamEntry,
} from "../MultiRacePage/types";
import StrategyAnalysis, { type StyleRepEntry } from "../MultiRacePage/components/WinDistributionCharts/StrategyAnalysis";
import { BAYES_UMA, COLORBLIND_STRATEGY_COLORS, STRATEGY_COLORS, STRATEGY_NAMES, STRATEGY_DISPLAY_ORDER } from "../MultiRacePage/components/WinDistributionCharts/constants";
import CharacterAnalysis from "../MultiRacePage/components/WinDistributionCharts/CharacterAnalysis";
import { useWinDistributionData } from "../MultiRacePage/components/WinDistributionCharts/useWinDistributionData";
import SkillAnalysis from "../MultiRacePage/components/SkillAnalysis";
import Histogram from "./Histogram";
import UmaFeatCard from "./FastestUmaPanel";
import { formatTime } from "../../data/UMDatabaseUtils";
import AssetLoader from "../../data/AssetLoader";
import TeamCompositionPanel from "./TeamCompositionPanel";
import TrueSkillTeamPanel from "./TrueSkillTeamPanel";
import SupportCardPanel from "../MultiRacePage/components/WinDistributionCharts/SupportCardPanel";
import ExplorerTab from "./ExplorerTab";
import "../MultiRacePage/MultiRacePage.css";
import "./UmaLogsPage.css";

type SerializedSkillStats = Omit<SkillStats, 'learnedByCharaIds' | 'learnedByStrategies'> & {
    learnedByCharaIds: number[];
    learnedByStrategies: number[];
};

type SerializedHorseEntry = Omit<HorseEntry, 'activatedSkillIds' | 'learnedSkillIds' | 'trainerName'> & {
    activatedSkillIds: number[];
    learnedSkillIds: number[];
    supportCardIds: number[];
    supportCardLimitBreaks: number[];
};

type SerializedStats = {
    totalRaces: number;
    totalHorses: number;
    avgRaceDistance: number;
    characterStats: CharacterStats[];
    strategyStats: StrategyStats[];
    rawStrategyTotals: Record<number, number>;
    roomCompositions: RoomCompositionEntry[];
    skillStats: [number, SerializedSkillStats][];
    skillBuckets: [number, SkillActivationBuckets][];
    allHorses: SerializedHorseEntry[];
    teamStats: TeamCompositionStats[];
    pairSynergy: PairSynergyStats[];
    gateWinRates?: GateWinRateStats[];
    gateWinRatesByFlavor?: GateWinRateSplitStats;
    trueskillRanking?: TrueSkillTeamEntry[];
};

type SerializedGroup = {
    raceId: string;
    courseId: number;
    trackLabel: string;
    raceCount: number;
    stats: SerializedStats;
};

type UmaLogsData = {
    generatedAt: string;
    groups: SerializedGroup[];
};

function deserializeStats(s: SerializedStats): AggregatedStats {
    return {
        totalRaces: s.totalRaces,
        totalHorses: s.totalHorses,
        avgRaceDistance: s.avgRaceDistance,
        characterStats: s.characterStats,
        strategyStats: s.strategyStats,
        rawStrategyTotals: s.rawStrategyTotals ?? {},
        roomCompositions: s.roomCompositions ?? [],
        skillStats: new Map(
            s.skillStats.map(([id, skill]) => [
                id,
                {
                    ...skill,
                    learnedByCharaIds: new Set(skill.learnedByCharaIds),
                    learnedByStrategies: new Set(skill.learnedByStrategies),
                },
            ])
        ),
        skillActivations: new Map(),
        skillActivationBuckets: new Map(s.skillBuckets),
        allHorses: s.allHorses.map((h) => ({
            ...h,
            trainerName: '',
            activatedSkillIds: new Set(h.activatedSkillIds),
            learnedSkillIds: new Set(h.learnedSkillIds),
            supportCardIds: h.supportCardIds ?? [],
            supportCardLimitBreaks: h.supportCardLimitBreaks ?? [],
        })),
        teamStats: s.teamStats,
        pairSynergy: s.pairSynergy ?? [],
        gateWinRates: s.gateWinRates ?? [],
        gateWinRatesByFlavor: s.gateWinRatesByFlavor ?? {
            total: s.gateWinRates ?? [],
            front: [],
            pace: [],
            late: [],
            end: [],
        },
        trueskillRanking: s.trueskillRanking ?? [],
    };
}

interface TrackGroup {
    courseId: number;
    trackLabel: string;
    raceCount: number;
    stats: AggregatedStats;
}

type Section = 'introduction' | 'overview' | 'strategy' | 'character' | 'skill' | 'explorer';

interface TrackGroupContentProps {
    group: TrackGroup;
    scoreWinnersOnly: boolean;
    setScoreWinnersOnly: (v: boolean) => void;
    totalRaces: number;
    totalUniqueUmas: number;
    strategyColors: Record<number, string>;
}

type StyleDeckRow = {
    deckKey: string;
    cardIds: number[];
    appearances: number;
    wins: number;
    popPct: number;
    adjWinRate: number;
};

const TrackGroupContent: React.FC<TrackGroupContentProps> = ({ group, scoreWinnersOnly, setScoreWinnersOnly, totalRaces, totalUniqueUmas, strategyColors }) => {
    const [section, setSection] = useState<Section>('introduction');
    const [cardUsageOpen, setCardUsageOpen] = useState(false);
    const [styleDecksOpen, setStyleDecksOpen] = useState(false);
    const [styleDeckSort, setStyleDeckSort] = useState<"pop" | "winRate">("pop");
    const [styleDeckMinPopPct, setStyleDeckMinPopPct] = useState<0 | 0.5 | 1 | 2>(0.5);
    const [gateFlavor, setGateFlavor] = useState<GateWinRateFlavor>('total');

    const allHorses = group.stats.allHorses;

    const winners = useMemo(
        () => allHorses.filter(h => h.finishOrder === 1 && h.finishTime > 0),
        [allHorses]
    );
    const scoredWinners = useMemo(() => winners.filter(h => h.rankScore > 0), [winners]);
    const fastestWin = useMemo(() => winners.reduce<HorseEntry | null>((b, h) => !b || h.finishTime < b.finishTime ? h : b, null), [winners]);
    const slowestWin = useMemo(() => winners.reduce<HorseEntry | null>((b, h) => !b || h.finishTime > b.finishTime ? h : b, null), [winners]);
    const highestWinner = useMemo(() => scoredWinners.reduce<HorseEntry | null>((b, h) => !b || h.rankScore > b.rankScore ? h : b, null), [scoredWinners]);
    const lowestWinner = useMemo(() => scoredWinners.reduce<HorseEntry | null>((b, h) => !b || h.rankScore < b.rankScore ? h : b, null), [scoredWinners]);

    const styleReps = useMemo<Record<number, StyleRepEntry[]>>(() => {
        const MIN_APPEARANCES = 5;
        const BAYES_PRIOR = BAYES_UMA.PRIOR;
        const BAYES_K = BAYES_UMA.K;
        type Tally = { cardId: number; charaId: number; charaName: string; wins: number; appearances: number };
        const map = new Map<string, Tally>();
        for (const h of allHorses) {
            const key = `${h.strategy}_${h.cardId}`;
            if (!map.has(key)) map.set(key, { cardId: h.cardId, charaId: h.charaId, charaName: h.charaName, wins: 0, appearances: 0 });
            const t = map.get(key)!;
            t.appearances++;
            if (h.finishOrder === 1) t.wins++;
        }
        const result: Record<number, StyleRepEntry[]> = {};
        for (const [key, t] of map.entries()) {
            if (t.appearances < MIN_APPEARANCES || t.wins === 0) continue;
            const strategy = Number(key.split('_')[0]);
            if (!result[strategy]) result[strategy] = [];
            const winRate = t.wins / t.appearances;
            const bayesianWinRate = (t.wins + BAYES_K * BAYES_PRIOR) / (t.appearances + BAYES_K);
            result[strategy].push({ ...t, winRate, bayesianWinRate });
        }
        for (const sId of [1, 2, 3, 4]) {
            if (result[sId]) {
                result[sId].sort((a, b) => b.bayesianWinRate - a.bayesianWinRate);
                result[sId] = result[sId].slice(0, 5);
            }
        }
        return result;
    }, [allHorses]);

    const {
        rawUnifiedCharacterWinsAll,
        rawUnifiedCharacterWinsOpp,
        rawUnifiedCharacterPop,
    } = useWinDistributionData(allHorses);
    const gateFlavorLabels: Record<GateWinRateFlavor, string> = {
        total: 'Total',
        front: 'Front',
        pace: 'Pace',
        late: 'Late',
        end: 'End',
    };
    const displayedGateWinRates = group.stats.gateWinRatesByFlavor[gateFlavor] ?? [];
    const gateWinRateBaseline = useMemo(() => {
        const totals = displayedGateWinRates.reduce((acc, gate) => {
            acc.wins += gate.wins;
            acc.appearances += gate.appearances;
            return acc;
        }, { wins: 0, appearances: 0 });
        return totals.appearances > 0 ? totals.wins / totals.appearances : 1 / 9;
    }, [displayedGateWinRates]);
    const gateWinRateColor = (winRate: number) => {
        const delta = winRate - gateWinRateBaseline;
        const t = Math.min(Math.abs(delta) / 0.03, 1);
        const from = [203, 213, 224];
        const to = delta >= 0 ? [104, 211, 145] : [252, 129, 129];
        const r = Math.round(from[0] + (to[0] - from[0]) * t);
        const g = Math.round(from[1] + (to[1] - from[1]) * t);
        const b = Math.round(from[2] + (to[2] - from[2]) * t);
        return `rgb(${r}, ${g}, ${b})`;
    };
    const availableDeckStyleIds = useMemo(() => {
        const present = new Set(allHorses.filter(h => h.supportCardIds.length === 6).map(h => h.strategy));
        const ordered = STRATEGY_DISPLAY_ORDER.filter(sid => present.has(sid)) as number[];
        for (const sid of present) {
            if (!ordered.includes(sid)) ordered.push(sid);
        }
        return ordered;
    }, [allHorses]);
    const [selectedDeckStyle, setSelectedDeckStyle] = useState<number>(availableDeckStyleIds[0] ?? 1);
    useEffect(() => {
        if (!availableDeckStyleIds.includes(selectedDeckStyle)) {
            setSelectedDeckStyle(availableDeckStyleIds[0] ?? 1);
        }
    }, [availableDeckStyleIds, selectedDeckStyle]);
    const styleDeckRowsByStyle = useMemo(() => {
        const result: Record<number, StyleDeckRow[]> = {};
        for (const sid of availableDeckStyleIds) {
            const horses = allHorses.filter(h => h.strategy === sid && h.supportCardIds.length === 6);
            const total = horses.length;
            if (total === 0) {
                result[sid] = [];
                continue;
            }
            const stat = group.stats.strategyStats.find(s => s.strategy === sid);
            const priorMean = stat && stat.totalRaces > 0 ? stat.wins / stat.totalRaces : horses.filter(h => h.finishOrder === 1).length / total;
            const deckMap = new Map<string, { cardIds: number[]; apps: number; wins: number }>();
            for (const h of horses) {
                const sortedCardIds = [...h.supportCardIds].sort((a, b) => a - b);
                const key = sortedCardIds.join('_');
                if (!deckMap.has(key)) deckMap.set(key, { cardIds: sortedCardIds, apps: 0, wins: 0 });
                const d = deckMap.get(key)!;
                d.apps++;
                if (h.finishOrder === 1) d.wins++;
            }
            result[sid] = Array.from(deckMap.values()).map(({ cardIds, apps, wins }) => ({
                deckKey: cardIds.join('_'),
                cardIds,
                appearances: apps,
                wins,
                popPct: (apps / total) * 100,
                adjWinRate: (wins + BAYES_UMA.K * priorMean) / (apps + BAYES_UMA.K),
            }));
        }
        return result;
    }, [allHorses, availableDeckStyleIds, group.stats.strategyStats]);
    const selectedStyleDeckRows = styleDeckRowsByStyle[selectedDeckStyle] ?? [];
    const effectiveStyleDeckMinPopPct = styleDeckSort === "pop" ? 0 : styleDeckMinPopPct;
    const filteredStyleDeckRows = useMemo(
        () => selectedStyleDeckRows.filter(r => r.popPct >= effectiveStyleDeckMinPopPct),
        [selectedStyleDeckRows, effectiveStyleDeckMinPopPct]
    );
    const selectedStyleDeckList = useMemo(() => {
        if (styleDeckSort === "pop") return [...filteredStyleDeckRows].sort((a, b) => b.appearances - a.appearances);
        return [...filteredStyleDeckRows].filter(r => r.wins > 0).sort((a, b) => b.adjWinRate - a.adjWinRate);
    }, [filteredStyleDeckRows, styleDeckSort]);
    const selectedStyleDeckMaxPct = useMemo(
        () => Math.max(...selectedStyleDeckList.slice(0, 20).flatMap(r => [r.popPct, r.adjWinRate * 100]), 1),
        [selectedStyleDeckList]
    );

    return (
        <>
            <Nav variant="tabs" className="uma-section-nav">
                {(['introduction', 'overview', 'strategy', 'character', 'skill', 'explorer'] as Section[]).map((s) => (
                    <Nav.Item key={s}>
                        <Nav.Link
                            active={section === s}
                            onClick={() => setSection(s)}
                            className="uma-section-link"
                        >
                            {s === 'introduction' ? 'Introduction' :
                                s === 'overview' ? 'Overview' :
                                    s === 'strategy' ? 'Strategy Analysis' :
                                        s === 'character' ? 'Character Analysis' :
                                            s === 'skill' ? 'Skill Analysis' :
                                                'Explorer'}
                        </Nav.Link>
                    </Nav.Item>
                ))}
            </Nav>

            {section === 'introduction' && (
                <div className="uma-intro-tab">
                    <h4>Welcome to UmaLogs</h4>
                    <p>
                        Welcome to the initial release of the public room data page, aka UmaLogs.
                        It currently serves stats for <strong>{totalRaces.toLocaleString()}</strong> total
                        CM10 room matches featuring <strong>{totalUniqueUmas.toLocaleString()}</strong> unique umas.
                    </p>
                    <p>
                        I'm currently no longer excluding debuffers from data since the previous implementation lead to results that were more misleading than helpful, will revisit.
                    </p>
                    <p>
                        Data collection for CM10 is over, the page will still see gradual improvement to prepare for CM11.
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
                    <p>More content to come when I have time.</p>
                </div>
            )}

            {section === 'overview' && (
                <div className="uma-overview-tab">
                    <div className="uma-stats-top">
                        <div className="uma-overview-main">
                            <div className="uma-overview-left">
                                <div className="uma-win-row">
                                    <Histogram
                                        values={winners.map(h => h.finishTime)}
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
                                        values={allHorses
                                            .filter(h => h.rankScore > 0 && (!scoreWinnersOnly || h.finishOrder === 1))
                                            .map(h => h.rankScore)}
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
                            {group.stats.gateWinRatesByFlavor.total.length > 0 && (
                                <div className="uma-gate-panel">
                                    <div className="uma-gate-panel-title">
                                        Gate Number Win Rates
                                        <span
                                            className="sa-info-icon"
                                            title="Runaway is included in Front"
                                        >
                                            i
                                        </span>
                                    </div>
                                    <div className="histogram-toggle uma-gate-toggle">
                                        {(Object.keys(gateFlavorLabels) as GateWinRateFlavor[]).map((flavor) => (
                                            <button
                                                key={flavor}
                                                className={`histogram-toggle-btn uma-gate-toggle-btn${gateFlavor === flavor ? " active" : ""}`}
                                                onClick={() => setGateFlavor(flavor)}
                                            >
                                                {gateFlavorLabels[flavor]}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="uma-gate-table-wrap" style={{ ['--gate-row-count' as any]: displayedGateWinRates.length }}>
                                        <div className="uma-gate-head-row">
                                            <div>Gate</div>
                                            <div className="uma-gate-cell--r">Wins</div>
                                            <div className="uma-gate-cell--r">Entries</div>
                                            <div className="uma-gate-cell--r">Win%</div>
                                        </div>
                                        <div className="uma-gate-body">
                                            {displayedGateWinRates.map((gate) => (
                                                <div key={gate.gateNumber} className="uma-gate-body-row">
                                                    <div>{gate.gateNumber}</div>
                                                    <div className="uma-gate-cell--r">{gate.wins}</div>
                                                    <div className="uma-gate-cell--r">{gate.appearances}</div>
                                                    <div className="uma-gate-cell--r" style={{ color: gateWinRateColor(gate.winRate) }}>
                                                        {(gate.winRate * 100).toFixed(1)}%
                                                    </div>
                                                </div>
                                            ))}
                                            {displayedGateWinRates.length === 0 && (
                                                <div className="uma-gate-body-row">
                                                    <div style={{ gridColumn: '1 / span 4', textAlign: 'center', color: '#718096' }}>
                                                        No data
                                                    </div>
                                                </div>
                                            )}
                                        </div>
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
                        </div>
                        {group.stats.trueskillRanking && group.stats.trueskillRanking.length > 0 && (
                            <TrueSkillTeamPanel
                                ranking={group.stats.trueskillRanking}
                                skillStats={group.stats.skillStats}
                            />
                        )}
                    </div>
                </div>
            )}
            {cardUsageOpen && (
                <div className="cdt-overlay" onClick={() => setCardUsageOpen(false)}>
                    <div className="cdt-modal ca-cards-modal" onClick={e => e.stopPropagation()}>
                        <div className="cdt-header">
                            <h3 className="cdt-title">Support Card Usage</h3>
                            <button className="cdt-close-btn" onClick={() => setCardUsageOpen(false)}>&times;</button>
                        </div>
                        <div className="cdt-content">
                            <SupportCardPanel horses={group.stats.allHorses} />
                        </div>
                    </div>
                </div>
            )}
            {styleDecksOpen && (
                <div className="cdt-overlay" onClick={() => setStyleDecksOpen(false)}>
                    <div className="cdt-modal ca-decks-modal" onClick={e => e.stopPropagation()}>
                        <div className="cdt-header">
                            <h3 className="cdt-title">Style Decks</h3>
                            <div className="ca-sort-toggle ca-sort-toggle--modal">
                                <button
                                    className={`ca-sort-btn${styleDeckSort === "pop" ? " ca-sort-btn--active" : ""}`}
                                    onClick={() => setStyleDeckSort("pop")}>
                                    By Population
                                </button>
                                <button
                                    className={`ca-sort-btn${styleDeckSort === "winRate" ? " ca-sort-btn--active" : ""}`}
                                    onClick={() => setStyleDeckSort("winRate")}>
                                    By Adj. Win%
                                </button>
                            </div>
                            <button className="cdt-close-btn" onClick={() => setStyleDecksOpen(false)}>&times;</button>
                        </div>
                        <div className="cdt-content">
                            <div className="histogram-toggle uma-gate-toggle" style={{ marginBottom: "10px" }}>
                                {availableDeckStyleIds.map((sid) => (
                                    <button
                                        key={sid}
                                        className={`histogram-toggle-btn uma-gate-toggle-btn${selectedDeckStyle === sid ? " active" : ""}`}
                                        onClick={() => setSelectedDeckStyle(sid)}
                                    >
                                        {STRATEGY_NAMES[sid] ?? `Style ${sid}`}
                                    </button>
                                ))}
                            </div>
                            {styleDeckSort === "winRate" && (
                                <div className="histogram-toggle uma-gate-toggle" style={{ marginBottom: "10px" }}>
                                    {([
                                        { value: 0.5 as const, label: "≥0.5% pop" },
                                        { value: 1 as const, label: "≥1% pop" },
                                        { value: 2 as const, label: "≥2% pop" },
                                        { value: 0 as const, label: "No minimum pop" },
                                    ]).map((opt) => (
                                        <button
                                            key={opt.value}
                                            className={`histogram-toggle-btn uma-gate-toggle-btn${styleDeckMinPopPct === opt.value ? " active" : ""}`}
                                            onClick={() => setStyleDeckMinPopPct(opt.value)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {selectedStyleDeckList.length === 0 ? (
                                <span className="sa-no-data">No deck data for this style.</span>
                            ) : selectedStyleDeckList.slice(0, 20).map(row => (
                                <div key={`${selectedDeckStyle}_${row.deckKey}`} className="sa-sb-row deck-row">
                                    <div className="deck-cards-grid">
                                        {row.cardIds.map((id, i) => (
                                            <img
                                                key={i}
                                                src={AssetLoader.getSupportCardIcon(id)}
                                                alt={`Card ${id}`}
                                                className="deck-card-icon"
                                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                            />
                                        ))}
                                    </div>
                                    <div className="deck-bars">
                                        <div className="sa-sb-bar-row">
                                            <div className="sa-sb-bar-label">Pop%</div>
                                            <div className="sa-sb-track sa-sb-track--pick">
                                                <div className="sa-sb-bar-fill sa-sb-bar-fill--pick" style={{ width: `${(row.popPct / selectedStyleDeckMaxPct) * 100}%` }} />
                                            </div>
                                            <div className="sa-sb-value sa-sb-value--pick" style={{ width: "auto", minWidth: "72px" }}>
                                                {row.popPct.toFixed(1)}% <span className="ca-abs-count">({row.appearances})</span>
                                            </div>
                                        </div>
                                        <div className="sa-sb-bar-row">
                                            <div className="sa-sb-bar-label">Win%</div>
                                            <div className="sa-sb-track sa-sb-track--win">
                                                <div className="sa-sb-bar-fill" style={{ width: `${(row.adjWinRate * 100 / selectedStyleDeckMaxPct) * 100}%`, background: "#68d391" }} />
                                            </div>
                                            <div className="sa-sb-value sa-sb-value--win" style={{ width: "auto", minWidth: "72px" }}>
                                                {(row.adjWinRate * 100).toFixed(1)}% <span className="ca-abs-count">({row.wins})</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {section === 'strategy' && (
                <div className="win-distribution-section">
                    <StrategyAnalysis
                        strategyStats={group.stats.strategyStats}
                        totalRaces={group.stats.totalRaces}
                        roomCompositions={group.stats.roomCompositions}
                        teamStats={group.stats.teamStats}
                        styleReps={styleReps}
                        allHorses={group.stats.allHorses}
                        skillStats={group.stats.skillStats}
                        strategyColors={strategyColors}
                    />
                </div>
            )}

            {section === 'character' && (
                <div className="win-distribution-section">
                    <CharacterAnalysis
                        rawWinsAll={rawUnifiedCharacterWinsAll}
                        rawWinsOpp={rawUnifiedCharacterWinsOpp}
                        rawPop={rawUnifiedCharacterPop}
                        spectatorMode
                        characterStats={group.stats.characterStats}
                        allHorses={group.stats.allHorses}
                        skillStats={group.stats.skillStats}
                        teamStats={group.stats.teamStats}
                        strategyColors={strategyColors}
                    />
                    <TeamCompositionPanel
                        teamStats={group.stats.teamStats}
                        allHorses={group.stats.allHorses}
                        skillStats={group.stats.skillStats}
                        strategyColors={strategyColors}
                    />
                </div>
            )}

            {section === 'skill' && (
                <SkillAnalysis
                    skillStats={group.stats.skillStats}
                    skillActivations={group.stats.skillActivations}
                    avgRaceDistance={group.stats.avgRaceDistance}
                    characterStats={group.stats.characterStats}
                    strategyStats={group.stats.strategyStats}
                    allHorses={group.stats.allHorses}
                    ownCharas={[]}
                    precomputedBuckets={group.stats.skillActivationBuckets}
                />
            )}

            {section === 'explorer' && (
                <ExplorerTab allHorses={group.stats.allHorses} strategyColors={strategyColors} />
            )}
        </>
    );
};

const UmaLogsPage: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<UmaLogsData | null>(null);
    const [activeTab, setActiveTab] = useState<string | null>(null);
    const [scoreWinnersOnly, setScoreWinnersOnly] = useState(false);
    const [colorblindMode, setColorblindMode] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem("umalogsColorblindMode");
        if (stored === "1") setColorblindMode(true);
    }, []);

    useEffect(() => {
        localStorage.setItem("umalogsColorblindMode", colorblindMode ? "1" : "0");
    }, [colorblindMode]);

    useEffect(() => {
        fetch(import.meta.env.BASE_URL + 'data/umalogs-stats.json.gz')
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status} — stats file not found`);
                return r.arrayBuffer();
            })
            .then((buf) => {
                const json = JSON.parse(pako.inflate(new Uint8Array(buf), { to: 'string' })) as UmaLogsData;
                setData(json);
                setLoading(false);
            })
            .catch((err: Error) => {
                setError(err.message);
                setLoading(false);
            });
    }, []);

    const trackGroups: TrackGroup[] = useMemo(() => {
        if (!data) return [];
        return data.groups.map((g) => ({
            courseId: g.courseId,
            trackLabel: g.trackLabel,
            raceCount: g.raceCount,
            stats: deserializeStats(g.stats),
        }));
    }, [data]);

    const defaultTab = trackGroups.length > 0 ? `track-${trackGroups[0].courseId}` : null;
    const currentTab = activeTab ?? defaultTab;

    const totalRaces = useMemo(() => data?.groups.reduce((s, g) => s + g.raceCount, 0) ?? 0, [data]);
    const generatedDate = data ? new Date(data.generatedAt).toLocaleDateString() : '';
    const totalUniqueUmas = useMemo(() => {
        const seen = new Set<string>();
        for (const g of trackGroups) {
            for (const h of g.stats.allHorses) {
                const skillKey = [...h.learnedSkillIds].sort((a, b) => a - b).join(',');
                seen.add(`${h.cardId}_${h.speed}_${h.stamina}_${h.pow}_${h.guts}_${h.wiz}_${skillKey}`);
            }
        }
        return seen.size;
    }, [trackGroups]);
    const strategyColors = colorblindMode ? COLORBLIND_STRATEGY_COLORS : STRATEGY_COLORS;

    if (loading) {
        return (
            <div className="p-4 text-center">
                <Spinner animation="border" /> Loading statistics…
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
                    {' · '}
                    {totalRaces} races
                    {' · '}
                    Updated {generatedDate}
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

            {trackGroups.length > 0 && (
                <Tab.Container
                    activeKey={currentTab ?? undefined}
                    onSelect={(key) => setActiveTab(key as string)}
                >
                    <div className="analysis-tabs">
                        <Nav variant="tabs">
                            {trackGroups.map((group) => (
                                <Nav.Item key={group.courseId}>
                                    <Nav.Link eventKey={`track-${group.courseId}`}>
                                        {group.trackLabel} ({group.raceCount})
                                    </Nav.Link>
                                </Nav.Item>
                            ))}
                        </Nav>
                    </div>

                    <Tab.Content>
                        {trackGroups.map((group) => (
                            <Tab.Pane
                                key={group.courseId}
                                eventKey={`track-${group.courseId}`}
                                transition={false}
                            >
                                <TrackGroupContent
                                    group={group}
                                    scoreWinnersOnly={scoreWinnersOnly}
                                    setScoreWinnersOnly={setScoreWinnersOnly}
                                    totalRaces={totalRaces}
                                    totalUniqueUmas={totalUniqueUmas}
                                    strategyColors={strategyColors}
                                />
                            </Tab.Pane>
                        ))}
                    </Tab.Content>
                </Tab.Container>
            )}
        </div>
    );
};

export default UmaLogsPage;
