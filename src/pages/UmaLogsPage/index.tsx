import React, { useState, useEffect, useMemo } from "react";
import pako from "pako";
import { Nav, Spinner, Alert } from "react-bootstrap";
import type {
    AggregatedStats,
    CharacterStats,
    GateBlockedStats,
    GateStats,
    GateStatsMode,
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
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import AssetLoader from "../../data/AssetLoader";
import TrueSkillTeamPanel from "./TrueSkillTeamPanel";
import SupportCardPanel from "../MultiRacePage/components/WinDistributionCharts/SupportCardPanel";
import ExplorerTab from "./ExplorerTab";
import { getHorseDeckRaceBonus } from "./deckUtils";
import "../MultiRacePage/MultiRacePage.css";
import "./UmaLogsPage.css";

type SerializedSkillStats = Omit<SkillStats, 'learnedByCharaIds' | 'learnedByStrategies'> & {
    learnedByCharaIds: number[];
    learnedByStrategies: number[];
};

type SerializedHorseEntry = Omit<HorseEntry, 'activatedSkillIds' | 'learnedSkillIds' | 'trainerName' | 'raceDistance' | 'isPlayer' | 'charaName'> & {
    activatedSkillIds: number[];
    learnedSkillIds: number[];
    supportCardIds: number[];
    supportCardLimitBreaks: number[];
};

type SerializedGateStats = Partial<GateStats> & {
    blockedRates?: GateBlockedStats[];
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
    gateStats?: SerializedGateStats;
    blockedRates?: GateBlockedStats[];
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
    cmId?: string;
    cmLabel?: string;
    groups: SerializedGroup[];
};

type ManifestEntry = {
    cmId: string;
    cmLabel: string;
    generatedAt: string;
    totalRaces: number;
    trackSummary?: string;
};

type Manifest = {
    datasets: ManifestEntry[];
};

function deserializeStats(s: SerializedStats): AggregatedStats {
    const legacyGateWinRatesByFlavor = s.gateWinRatesByFlavor ?? {
        total: s.gateWinRates ?? [],
        front: [],
        pace: [],
        late: [],
        end: [],
    };
    const gateStats = {
        winRatesByFlavor: s.gateStats?.winRatesByFlavor ?? legacyGateWinRatesByFlavor,
        blockedRatesByFlavor: s.gateStats?.blockedRatesByFlavor ?? {
            total: s.gateStats?.blockedRates ?? s.blockedRates ?? [],
            front: [],
            pace: [],
            late: [],
            end: [],
        },
        dodgingDangerRates: s.gateStats?.dodgingDangerRates ?? [],
    };

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
            charaName: UMDatabaseWrapper.charas[h.charaId]?.name ?? `Unknown (${h.charaId})`,
            trainerName: '',
            raceDistance: 0,
            isPlayer: false,
            activatedSkillIds: new Set(h.activatedSkillIds),
            learnedSkillIds: new Set(h.learnedSkillIds),
            careerWinCount: h.careerWinCount ?? 0,
            supportCardIds: h.supportCardIds ?? [],
            supportCardLimitBreaks: h.supportCardLimitBreaks ?? [],
        })),
        teamStats: s.teamStats,
        pairSynergy: s.pairSynergy ?? [],
        gateStats,
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
    cmLabel: string;
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
    raceBonus: number;
};

type RaceBonusOverviewRow = {
    bucketStart: number;
    bucketEnd: number;
    appearances: number;
    wins: number;
    popPct: number;
    adjWinRate: number;
    isOther: boolean;
};

const RACE_BONUS_OTHER_MIN_POP_PCT = 0.5;

const TrackGroupContent: React.FC<TrackGroupContentProps> = ({ group, cmLabel, scoreWinnersOnly, setScoreWinnersOnly, totalRaces, totalUniqueUmas, strategyColors }) => {
    const [section, setSection] = useState<Section>('introduction');
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
        const BAYES_PRIOR = BAYES_UMA.PRIOR;
        const BAYES_K = BAYES_UMA.K;
        type Tally = { cardId: number; charaId: number; charaName: string; wins: number; appearances: number };
        const map = new Map<string, Tally>();
        const totalsByStrategy = new Map<number, number>();
        for (const h of allHorses) {
            const key = `${h.strategy}_${h.cardId}`;
            if (!map.has(key)) map.set(key, { cardId: h.cardId, charaId: h.charaId, charaName: h.charaName, wins: 0, appearances: 0 });
            const t = map.get(key)!;
            t.appearances++;
            if (h.finishOrder === 1) t.wins++;
            totalsByStrategy.set(h.strategy, (totalsByStrategy.get(h.strategy) ?? 0) + 1);
        }
        const result: Record<number, StyleRepEntry[]> = {};
        for (const [key, t] of map.entries()) {
            if (t.wins === 0) continue;
            const strategy = Number(key.split('_')[0]);
            if (!result[strategy]) result[strategy] = [];
            const totalAppearances = totalsByStrategy.get(strategy) ?? 0;
            const winRate = t.wins / t.appearances;
            const bayesianWinRate = (t.wins + BAYES_K * BAYES_PRIOR) / (t.appearances + BAYES_K);
            const popPct = totalAppearances > 0 ? (t.appearances / totalAppearances) * 100 : 0;
            result[strategy].push({ ...t, popPct, winRate, bayesianWinRate });
        }
        for (const sId of [1, 2, 3, 4]) {
            if (result[sId]) {
                result[sId].sort((a, b) => b.bayesianWinRate - a.bayesianWinRate);
                result[sId] = result[sId].slice(0, 5);
            }
        }
        return result;
    }, [allHorses]);

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

    type OverviewSkillRow = { skillId: number; name: string; isInherit: boolean; appearances: number; winAppearances: number; popPct: number; adjWinRate: number };
    const skillsByStrategy = useMemo((): Record<number, OverviewSkillRow[]> => {
        const result: Record<number, OverviewSkillRow[]> = {};
        for (const strategyId of [1, 2, 3, 4, 5]) {
            const horses = allHorses.filter(h => h.strategy === strategyId);
            const total = horses.length;
            if (total === 0) continue;
            const totalWins = horses.filter(h => h.finishOrder === 1).length;
            const BAYES_K = BAYES_UMA.K;
            const priorMean = totalWins / total;
            const counts = new Map<number, { apps: number; winApps: number }>();
            for (const h of horses) {
                for (const sid of h.learnedSkillIds) {
                    const c = counts.get(sid) ?? { apps: 0, winApps: 0 };
                    c.apps++;
                    if (h.finishOrder === 1) c.winApps++;
                    counts.set(sid, c);
                }
            }
            const rows: OverviewSkillRow[] = [];
            for (const [skillId, { apps, winApps }] of counts) {
                rows.push({
                    skillId,
                    name: UMDatabaseWrapper.skillName(skillId),
                    isInherit: skillId >= 900000 && skillId < 1000000,
                    appearances: apps,
                    winAppearances: winApps,
                    popPct: (apps / total) * 100,
                    adjWinRate: (winApps + BAYES_K * priorMean) / (apps + BAYES_K),
                });
            }
            result[strategyId] = rows;
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
    useEffect(() => {
        if (gateMode === 'dodgingDanger' && gateFlavor !== 'front') {
            setGateFlavor('front');
        }
    }, [gateFlavor, gateMode]);
    const raceBonusRows = useMemo(() => {
        const horses = allHorses.filter(h => h.supportCardIds.length === 6);
        const map = new Map<number, { appearances: number; wins: number }>();
        for (const h of horses) {
            const rb = getHorseDeckRaceBonus(h);
            if (rb === null) continue;
            const bucketStart = Math.floor(rb / 5) * 5;
            if (!map.has(bucketStart)) map.set(bucketStart, { appearances: 0, wins: 0 });
            const e = map.get(bucketStart)!;
            e.appearances++;
            if (h.finishOrder === 1) e.wins++;
        }
        const total = horses.length;
        const priorMean = total > 0 ? horses.filter(h => h.finishOrder === 1).length / total : 1 / 9;
        const entries = Array.from(map.entries());
        const meetsOverviewThreshold = (appearances: number) =>
            total > 0 && (appearances / total) * 100 >= RACE_BONUS_OTHER_MIN_POP_PCT;
        const rows: RaceBonusOverviewRow[] = entries
            .filter(([, { appearances }]) => meetsOverviewThreshold(appearances))
            .map(([bucketStart, { appearances, wins }]) => ({
                bucketStart,
                bucketEnd: bucketStart + 4,
                appearances,
                wins,
                popPct: (appearances / total) * 100,
                adjWinRate: (wins + BAYES_UMA.K * priorMean) / (appearances + BAYES_UMA.K),
                isOther: false,
            }))
            .sort((a, b) => a.bucketStart - b.bucketStart);
        const otherFiltered = entries.filter(([, { appearances }]) => !meetsOverviewThreshold(appearances));
        const otherAppearances = otherFiltered.reduce((sum, [, { appearances }]) => sum + appearances, 0);
        const otherWins = otherFiltered.reduce((sum, [, { wins }]) => sum + wins, 0);
        if (otherAppearances > 0) {
            rows.push({
                bucketStart: -1,
                bucketEnd: -1,
                appearances: otherAppearances,
                wins: otherWins,
                popPct: (otherAppearances / total) * 100,
                adjWinRate: 0,
                isOther: true,
            });
        }
        return rows;
    }, [allHorses]);

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
            const deckMap = new Map<string, { cardIds: number[]; apps: number; wins: number; raceBonus: number }>();
            for (const h of horses) {
                const raceBonus = getHorseDeckRaceBonus(h);
                if (raceBonus === null) continue;
                const sortedCardIds = [...h.supportCardIds].sort((a, b) => a - b);
                const key = `${sortedCardIds.join('_')}|rb${raceBonus}`;
                if (!deckMap.has(key)) deckMap.set(key, { cardIds: sortedCardIds, apps: 0, wins: 0, raceBonus });
                const d = deckMap.get(key)!;
                d.apps++;
                if (h.finishOrder === 1) d.wins++;
            }
            result[sid] = Array.from(deckMap.values()).map(({ cardIds, apps, wins, raceBonus }) => ({
                deckKey: `${cardIds.join('_')}|rb${raceBonus}`,
                cardIds,
                appearances: apps,
                wins,
                popPct: (apps / total) * 100,
                adjWinRate: (wins + BAYES_UMA.K * priorMean) / (apps + BAYES_UMA.K),
                raceBonus,
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
        return [...filteredStyleDeckRows].sort((a, b) => b.adjWinRate - a.adjWinRate);
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
                    <p>
                        Welcome to the public room data page, aka UmaLogs.
                        It currently serves stats for <strong>{totalRaces.toLocaleString()}</strong> total{' '}
                        {cmLabel} room matches featuring <strong>{totalUniqueUmas.toLocaleString()}</strong> unique umas.
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
                    <p>CM11 data collection is ongoing, and will probably finish around 30000 rooms.</p>
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
                                                allHorses={group.stats.allHorses}
                                            />
                                        )}
                                        {slowestWin && (
                                            <UmaFeatCard
                                                horse={slowestWin}
                                                label="Slowest Win"
                                                displayValue={formatTime(slowestWin.finishTime)}
                                                skillStats={group.stats.skillStats}
                                                strategyColors={strategyColors}
                                                allHorses={group.stats.allHorses}
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
                                                allHorses={group.stats.allHorses}
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
                                                allHorses={group.stats.allHorses}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}
                            {hasGateStats && (
                                <div className="uma-gate-panel">
                                    <div className="uma-gate-panel-title">
                                        Gate Stats
                                        <span
                                            className="sa-info-icon"
                                            title="Runaway is included in Front."
                                        >
                                            i
                                        </span>
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
                                                            <div style={{ gridColumn: '1 / span 4', textAlign: 'center', color: '#718096' }}>
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
                                                            <div style={{ gridColumn: '1 / span 3', textAlign: 'center', color: '#718096' }}>
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
                                                            <div style={{ gridColumn: '1 / span 3', textAlign: 'center', color: '#718096' }}>
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
            {skillsOpen && (() => {
                const strategyRows = skillsByStrategy[skillsStrategyTab] ?? [];
                const effectiveMinPop = skillsSort === "winRate" ? skillsMinPopPct : 0;
                const filtered = effectiveMinPop > 0 ? strategyRows.filter(r => r.popPct >= effectiveMinPop) : strategyRows;
                const sorted = skillsSort === "pop"
                    ? [...filtered].sort((a, b) => b.popPct - a.popPct)
                    : [...filtered].filter(r => r.winAppearances > 0).sort((a, b) => b.adjWinRate - a.adjWinRate);
                const maxP = Math.max(...sorted.map(r => Math.max(r.popPct, r.adjWinRate * 100)), 1);
                const activeStrategies = ([5, 1, 2, 3, 4] as const).filter(s => (skillsByStrategy[s]?.length ?? 0) > 0);
                return (
                    <div className="cdt-overlay" onClick={() => setSkillsOpen(false)}>
                        <div className="cdt-modal ca-skills-modal" onClick={e => e.stopPropagation()}>
                            <div className="cdt-header">
                                <h3 className="cdt-title">Skills by Strategy</h3>
                                <div className="ca-sort-toggle ca-sort-toggle--modal">
                                    <button className={`ca-sort-btn${skillsSort === "pop" ? " ca-sort-btn--active" : ""}`} onClick={() => setSkillsSort("pop")}>By Population</button>
                                    <button className={`ca-sort-btn${skillsSort === "winRate" ? " ca-sort-btn--active" : ""}`} onClick={() => setSkillsSort("winRate")}>By Adj. Win%</button>
                                </div>
                                <button className="cdt-close-btn" onClick={() => setSkillsOpen(false)}>&times;</button>
                            </div>
                            <div className="cdt-content">
                                <div className="histogram-toggle uma-gate-toggle" style={{ marginBottom: "10px" }}>
                                    {activeStrategies.map(sId => (
                                        <button
                                            key={sId}
                                            className={`histogram-toggle-btn uma-gate-toggle-btn${skillsStrategyTab === sId ? " active" : ""}`}
                                            onClick={() => setSkillsStrategyTab(sId)}
                                        >
                                            {STRATEGY_NAMES[sId] ?? `Strategy ${sId}`}
                                        </button>
                                    ))}
                                </div>
                                {skillsSort === "winRate" && (
                                    <div className="scp-pop-filter-toggle" style={{ marginBottom: "10px" }}>
                                        {([
                                            { value: 0.5 as const, label: "≥0.5% pop" },
                                            { value: 1 as const, label: "≥1% pop" },
                                            { value: 2 as const, label: "≥2% pop" },
                                            { value: 0 as const, label: "No minimum pop" },
                                        ]).map(opt => (
                                            <button
                                                key={opt.value}
                                                className={`scp-pop-filter-btn${skillsMinPopPct === opt.value ? " active" : ""}`}
                                                onClick={() => setSkillsMinPopPct(opt.value)}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {sorted.length === 0 ? (
                                    <span className="sa-no-data">No skill data for this strategy.</span>
                                ) : sorted.map(row => {
                                    const iconUrl = getSkillIconUrl(row.skillId);
                                    return (
                                    <div key={row.skillId} className="sa-sb-row">
                                        <div className="ca-char-label">
                                            {iconUrl && <img src={iconUrl} alt="" className="ca-skills-skill-icon" />}
                                            <span className="ca-skills-skill-name">{row.name}</span>
                                            {row.isInherit && <span className="exp-skill-inherit-tag">(inherit)</span>}
                                        </div>
                                        <div className="sa-sb-bar-row">
                                            <div className="sa-sb-bar-label">Pop%</div>
                                            <div className="sa-sb-track sa-sb-track--pick">
                                                <div className="sa-sb-bar-fill sa-sb-bar-fill--pick" style={{ width: `${(row.popPct / maxP) * 100}%` }} />
                                            </div>
                                            <div className="sa-sb-value sa-sb-value--pick" style={{ width: "auto", minWidth: "72px" }}>
                                                {row.popPct.toFixed(1)}% <span className="ca-abs-count">({row.appearances})</span>
                                            </div>
                                        </div>
                                        <div className="sa-sb-bar-row">
                                            <div className="sa-sb-bar-label">Win%</div>
                                            <div className="sa-sb-track sa-sb-track--win">
                                                <div className="sa-sb-bar-fill" style={{ width: `${(row.adjWinRate * 100 / maxP) * 100}%`, background: "#68d391" }} />
                                            </div>
                                            <div className="sa-sb-value sa-sb-value--win" style={{ width: "auto", minWidth: "72px" }}>
                                                {(row.adjWinRate * 100).toFixed(1)}% <span className="ca-abs-count">({row.winAppearances})</span>
                                            </div>
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })()}
            {styleDecksOpen && (
                <div className="cdt-overlay" onClick={() => setStyleDecksOpen(false)}>
                    <div className="cdt-modal ca-decks-modal" onClick={e => e.stopPropagation()}>
                        <div className="cdt-header">
                            <h3 className="cdt-title">Decks</h3>
                            <div className="ca-sort-toggle ca-sort-toggle--modal">
                                <button
                                    className={`ca-sort-btn${deckModalTab === "overview" ? " ca-sort-btn--active" : ""}`}
                                    onClick={() => setDeckModalTab("overview")}>
                                    Overview
                                </button>
                                <button
                                    className={`ca-sort-btn${deckModalTab === "decks" ? " ca-sort-btn--active" : ""}`}
                                    onClick={() => setDeckModalTab("decks")}>
                                    Decks
                                </button>
                            </div>
                            <button className="cdt-close-btn" onClick={() => setStyleDecksOpen(false)}>&times;</button>
                        </div>
                        <div className="cdt-content">
                            {deckModalTab === "overview" && (() => {
                                const maxPct = Math.max(...raceBonusRows.filter(r => !r.isOther).map(r => Math.max(r.popPct, r.adjWinRate * 100)), 1);
                                return raceBonusRows.length === 0
                                    ? <span className="sa-no-data">No deck data available.</span>
                                    : (
                                        <table className="rb-table">
                                            <thead>
                                                <tr>
                                                    <th className="rb-th">Race Bonus</th>
                                                    <th className="rb-th rb-th--r">Entries</th>
                                                    <th className="rb-th rb-th--r">Wins</th>
                                                    <th className="rb-th rb-th--bars">Pop% / Adj. Win%</th>
                                                </tr>
                                            </thead>
                                                <tbody>
                                                    {raceBonusRows.map(row => (
                                                    <tr key={row.isOther ? "other" : row.bucketStart} className="rb-row">
                                                        <td className="rb-td rb-td--bonus">{row.isOther ? <span style={{ color: "#718096", fontWeight: "normal" }}>Other <span className="sa-info-icon" title={`Race bonus buckets with under ${RACE_BONUS_OTHER_MIN_POP_PCT}% population are grouped here.`}>i</span></span> : `${row.bucketStart}-${row.bucketEnd}%`}</td>
                                                        <td className="rb-td rb-td--r">{row.appearances}</td>
                                                        <td className="rb-td rb-td--r">{row.wins}</td>
                                                        <td className="rb-td rb-td--bars">
                                                            <div className="sa-sb-bar-row">
                                                                <div className="sa-sb-bar-label">Pop%</div>
                                                                <div className="sa-sb-track sa-sb-track--pick">
                                                                    <div className="sa-sb-bar-fill sa-sb-bar-fill--pick" style={{ width: `${(row.popPct / maxPct) * 100}%` }} />
                                                                </div>
                                                                <div className="sa-sb-value sa-sb-value--pick">{row.popPct.toFixed(1)}%</div>
                                                            </div>
                                                            {!row.isOther && (
                                                                <div className="sa-sb-bar-row">
                                                                    <div className="sa-sb-bar-label">Win%</div>
                                                                    <div className="sa-sb-track sa-sb-track--win">
                                                                        <div className="sa-sb-bar-fill" style={{ width: `${(row.adjWinRate * 100 / maxPct) * 100}%`, background: "#68d391" }} />
                                                                    </div>
                                                                    <div className="sa-sb-value sa-sb-value--win">{(row.adjWinRate * 100).toFixed(1)}%</div>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    );
                            })()}
                            {deckModalTab === "decks" && (
                                <>
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
                                    <div className="ca-sort-toggle" style={{ marginBottom: "10px" }}>
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
                                                <div style={{ fontSize: "11px", color: "#a0aec0", marginBottom: "4px" }}>Race bonus: <span style={{ color: "#fbbf24", fontWeight: "bold" }}>{row.raceBonus}%</span></div>
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
                                </>
                            )}
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
    const [manifest, setManifest] = useState<Manifest | null>(null);
    const [manifestError, setManifestError] = useState<string | null>(null);
    const [selectedCmId, setSelectedCmId] = useState<string | null>(null);
    const [loadedDatasets, setLoadedDatasets] = useState<Record<string, UmaLogsData>>({});
    const [loadingCmId, setLoadingCmId] = useState<string | null>(null);
    const [datasetError, setDatasetError] = useState<string | null>(null);
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
        fetch(import.meta.env.BASE_URL + 'data/umalogs-manifest.json')
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status} — manifest not found`);
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

    // Lazy-load a dataset's stats file when it's selected and not yet cached.
    useEffect(() => {
        if (!selectedCmId || loadedDatasets[selectedCmId] || loadingCmId === selectedCmId) return;
        setLoadingCmId(selectedCmId);
        setDatasetError(null);
        const url = import.meta.env.BASE_URL + `data/umalogs-${selectedCmId}-stats.json.gz`;
        fetch(url)
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status} — stats file not found`);
                return r.arrayBuffer();
            })
            .then((buf) => {
                const json = JSON.parse(pako.inflate(new Uint8Array(buf), { to: 'string' })) as UmaLogsData;
                setLoadedDatasets((prev) => ({ ...prev, [selectedCmId]: json }));
                setLoadingCmId(null);
            })
            .catch((err: Error) => {
                setDatasetError(err.message);
                setLoadingCmId(null);
            });
    }, [selectedCmId, loadedDatasets, loadingCmId]);

    const handleSelectCm = (newCmId: string) => {
        if (newCmId === selectedCmId) return;
        setSelectedCmId(newCmId);
    };

    const data = selectedCmId ? (loadedDatasets[selectedCmId] ?? null) : null;
    const loading = manifest === null || (selectedCmId !== null && !loadedDatasets[selectedCmId]);
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
                    {cmLabel}
                    {' · '}
                    {totalRaces} races
                    {' · '}
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
                    key={group.courseId}
                    group={group}
                    cmLabel={cmLabel}
                    scoreWinnersOnly={scoreWinnersOnly}
                    setScoreWinnersOnly={setScoreWinnersOnly}
                    totalRaces={totalRaces}
                    totalUniqueUmas={totalUniqueUmas}
                    strategyColors={strategyColors}
                />
            ))}
        </div>
    );
};

export default UmaLogsPage;
