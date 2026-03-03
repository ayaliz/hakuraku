import React, { useState, useEffect, useMemo } from "react";
import pako from "pako";
import { Nav, Spinner, Tab, Alert } from "react-bootstrap";
import type {
    AggregatedStats,
    CharacterStats,
    HorseEntry,
    PairSynergyStats,
    RoomCompositionEntry,
    SkillActivationBuckets,
    SkillStats,
    StrategyStats,
    TeamCompositionStats,
} from "../MultiRacePage/types";
import StrategyAnalysis, { type StyleRepEntry } from "../MultiRacePage/components/WinDistributionCharts/StrategyAnalysis";
import { BAYES_UMA } from "../MultiRacePage/components/WinDistributionCharts/constants";
import CharacterAnalysis from "../MultiRacePage/components/WinDistributionCharts/CharacterAnalysis";
import { useWinDistributionData } from "../MultiRacePage/components/WinDistributionCharts/useWinDistributionData";
import SkillAnalysis from "../MultiRacePage/components/SkillAnalysis";
import Histogram from "./Histogram";
import UmaFeatCard from "./FastestUmaPanel";
import { formatTime } from "../../data/UMDatabaseUtils";
import TeamCompositionPanel from "./TeamCompositionPanel";
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
}

const TrackGroupContent: React.FC<TrackGroupContentProps> = ({ group, scoreWinnersOnly, setScoreWinnersOnly, totalRaces, totalUniqueUmas }) => {
    const [section, setSection] = useState<Section>('introduction');
    const [cardUsageOpen, setCardUsageOpen] = useState(false);

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
                        A lot of stuff isn't polished yet, but it should be mostly understandable.
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
                            {fastestWin && (
                                <UmaFeatCard
                                    horse={fastestWin}
                                    label="Fastest Win"
                                    displayValue={formatTime(fastestWin.finishTime)}
                                    skillStats={group.stats.skillStats}
                                />
                            )}
                            {slowestWin && (
                                <UmaFeatCard
                                    horse={slowestWin}
                                    label="Slowest Win"
                                    displayValue={formatTime(slowestWin.finishTime)}
                                    skillStats={group.stats.skillStats}
                                />
                            )}
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
                            {highestWinner && (
                                <UmaFeatCard
                                    horse={highestWinner}
                                    label="Highest Winner"
                                    displayValue={highestWinner.rankScore.toLocaleString()}
                                    displayValueColor="#68d391"
                                    showRankIcon
                                    skillStats={group.stats.skillStats}
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
                                />
                            )}
                        </div>
                        <div className="uma-overview-actions">
                            <button className="ca-decks-btn" onClick={() => setCardUsageOpen(true)}>
                                <img src={`${import.meta.env.BASE_URL}assets/textures/card.webp`} alt="" className="ca-decks-btn-icon" />
                                View card usage
                            </button>
                        </div>
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

            {section === 'strategy' && (
                <div className="win-distribution-section">
                    <StrategyAnalysis
                        strategyStats={group.stats.strategyStats}
                        totalRaces={group.stats.totalRaces}
                        roomCompositions={group.stats.roomCompositions}
                        teamStats={group.stats.teamStats}
                        styleReps={styleReps}
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
                        pairSynergy={group.stats.pairSynergy}
                        characterStats={group.stats.characterStats}
                        allHorses={group.stats.allHorses}
                    />
                    <TeamCompositionPanel teamStats={group.stats.teamStats} />
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
                <ExplorerTab allHorses={group.stats.allHorses} />
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
            <div className="mb-3 uma-page-header">
                <strong>Room Match Statistics</strong>
                {' · '}
                {totalRaces} races
                {' · '}
                Updated {generatedDate}
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
