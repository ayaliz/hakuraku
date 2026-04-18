import React, { useState, useCallback, useMemo, useEffect } from "react";
import { Alert, Nav, Spinner, Tab } from "react-bootstrap";
import { useSearchParams } from "react-router-dom";
import { ParsedRace, AggregatedStats } from "./types";
import { parseRaceJson, aggregateStats, getGroundConditionLabel, getSeasonLabel, getTrackLabel, getWeatherLabel } from "./utils";
import "./MultiRacePage.css";

import RaceUploadZone from "./components/RaceUploadZone";
import RaceListPanel from "./components/RaceListPanel";
import WinDistributionCharts from "./components/WinDistributionCharts";
import SkillAnalysis from "./components/SkillAnalysis";
import HpSpurtAnalysis from "./components/HpSpurtAnalysis";
import { computeHpSpurtStats } from "./components/HpSpurtAnalysis/processData";
import { CharaHpSpurtStats } from "./components/HpSpurtAnalysis/types";
import TeamSampleSelect, { type TeamSampleSelectOption } from "./components/WinDistributionCharts/TeamSampleSelect";
import { STRATEGY_COLORS } from "./components/WinDistributionCharts/constants";
import ExplorerTab from "../UmaLogsPage/ExplorerTab";
import type { AccountDatasetRaceExportResponse } from "../../auth/authShared";

const HORSEACT_SETUP_URL = "https://github.com/ayaliz/horseACT#installation";

interface TrackGroup {
    groupKey: string;
    courseId: number;
    trackLabel: string;
    conditionLabel: string;
    races: ParsedRace[];
    stats: AggregatedStats;
    hpSpurtStats: CharaHpSpurtStats[];
    playerTeamOptions: TeamSampleSelectOption[];
    raceIdsByPlayerTeamKey: Map<string, Set<string>>;
}

interface FilteredTrackGroup extends TrackGroup {
    selectedTeamKey: string;
    filteredStats: AggregatedStats;
    filteredHpSpurtStats: CharaHpSpurtStats[];
}

function buildExactTeamMemberKey(horse: AggregatedStats["allHorses"][number]): string {
    const learnedSkillKey = Array.from(horse.learnedSkillIds).sort((a, b) => a - b).join(",");
    return [
        horse.cardId,
        horse.strategy,
        horse.speed,
        horse.stamina,
        horse.pow,
        horse.guts,
        horse.wiz,
        horse.rankScore,
        learnedSkillKey,
    ].join("_");
}

function buildPlayerTeamFilterData(
    races: ParsedRace[],
    stats: AggregatedStats,
): {
    playerTeamOptions: TeamSampleSelectOption[];
    raceIdsByPlayerTeamKey: Map<string, Set<string>>;
} {
    const horsesByRaceId = new Map<string, typeof stats.allHorses>();
    const raceIdsByPlayerTeamKey = new Map<string, Set<string>>();
    const teamDataByKey = new Map<string, {
        samples: number;
        winsByMemberKey: Map<string, number>;
        members: { cardId: number; strategy: number; sortKey: number }[];
    }>();

    stats.allHorses.forEach((horse) => {
        const existing = horsesByRaceId.get(horse.raceId);
        if (existing) {
            existing.push(horse);
            return;
        }
        horsesByRaceId.set(horse.raceId, [horse]);
    });

    races.forEach((race) => {
        const playerTeam = (horsesByRaceId.get(race.id) ?? [])
            .filter((horse) => horse.isPlayer)
            .slice()
            .sort((a, b) => (a.cardId * 10 + a.strategy) - (b.cardId * 10 + b.strategy));

        if (playerTeam.length !== 3) {
            return;
        }

        const teamKey = playerTeam.map((horse) => buildExactTeamMemberKey(horse)).join("__");
        const raceIds = raceIdsByPlayerTeamKey.get(teamKey) ?? new Set<string>();
        raceIds.add(race.id);
        raceIdsByPlayerTeamKey.set(teamKey, raceIds);

        const teamData = teamDataByKey.get(teamKey) ?? {
            samples: 0,
            winsByMemberKey: new Map<string, number>(),
            members: playerTeam.map((horse) => ({
                cardId: horse.cardId,
                strategy: horse.strategy,
                sortKey: horse.cardId * 10 + horse.strategy,
            })),
        };
        teamData.samples += 1;
        playerTeam.forEach((horse) => {
            if (horse.finishOrder !== 1) {
                return;
            }
            const memberKey = buildExactTeamMemberKey(horse);
            teamData.winsByMemberKey.set(memberKey, (teamData.winsByMemberKey.get(memberKey) ?? 0) + 1);
        });
        teamDataByKey.set(teamKey, teamData);
    });

    const playerTeamOptions = Array.from(teamDataByKey.entries())
        .map(([value, teamData]) => ({
            value,
            samples: teamData.samples,
            members: teamData.members
                .slice()
                .sort((a, b) => a.sortKey - b.sortKey)
                .map((member) => {
                    const memberKey = [
                        member.cardId,
                        member.strategy,
                    ].join("_");
                    return {
                        cardId: member.cardId,
                        strategy: member.strategy,
                        winRatePct: teamData.samples > 0
                            ? ((Array.from(teamData.winsByMemberKey.entries())
                                .filter(([key]) => key.startsWith(`${memberKey}_`))
                                .reduce((sum, [, wins]) => sum + wins, 0)) / teamData.samples) * 100
                            : 0,
                    };
                }),
        }))
        .sort((a, b) => b.samples - a.samples || a.value.localeCompare(b.value));

    return {
        playerTeamOptions,
        raceIdsByPlayerTeamKey,
    };
}

const MultiRacePage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const [races, setRaces] = useState<ParsedRace[]>([]);
    const [errors, setErrors] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeTrackTab, setActiveTrackTab] = useState<string | null>(null);
    const [accountImportLoading, setAccountImportLoading] = useState(false);
    const [accountImportLabel, setAccountImportLabel] = useState<string | null>(null);
    const [selectedTeamFilters, setSelectedTeamFilters] = useState<Record<string, string>>({});

    const handleFilesSelected = useCallback(async (files: File[]) => {
        setIsProcessing(true);
        setErrors([]);

        const newRaces: ParsedRace[] = [];
        const newErrors: string[] = [];

        for (const file of files) {
            if (!/\.json$/i.test(file.name)) {
                newErrors.push(`${file.name}: Not a JSON file`);
                continue;
            }

            try {
                const text = await file.text();
                const json = JSON.parse(text);
                const result = parseRaceJson(json, file.name);

                if ("error" in result) {
                    newErrors.push(`${file.name}: ${result.error}`);
                } else {
                    const isDuplicate = races.some((race) => race.fileName === file.name);
                    if (isDuplicate) {
                        newErrors.push(`${file.name}: Already loaded`);
                    } else {
                        newRaces.push(result);
                    }
                }
            } catch (err: any) {
                newErrors.push(`${file.name}: ${err.message}`);
            }
        }

        setRaces((prev) => [...prev, ...newRaces]);
        setErrors((prev) => [...prev, ...newErrors]);
        setIsProcessing(false);
    }, [races]);

    const handleRemoveRace = useCallback((raceId: string) => {
        setRaces((prev) => prev.filter((race) => race.id !== raceId));
    }, []);

    const handleClearAll = useCallback(() => {
        setRaces([]);
        setErrors([]);
        setActiveTrackTab(null);
        setAccountImportLabel(null);
        setSelectedTeamFilters({});
    }, []);

    useEffect(() => {
        const datasetKey = searchParams.get("accountDataset");
        if (!datasetKey) {
            return;
        }

        let cancelled = false;
        setAccountImportLoading(true);
        setErrors([]);

        void (async () => {
            try {
                const response = await fetch(`/api/account/races/datasets/${encodeURIComponent(datasetKey)}/export`, {
                    credentials: "same-origin",
                });
                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(text || `HTTP ${response.status}`);
                }
                const payload = await response.json() as AccountDatasetRaceExportResponse;
                const nextRaces: ParsedRace[] = [];
                const nextErrors: string[] = [];
                for (const race of payload.races) {
                    const parsed = parseRaceJson(race.payload, race.fileName);
                    if ("error" in parsed) {
                        nextErrors.push(`${race.fileName}: ${parsed.error}`);
                    } else {
                        nextRaces.push(parsed);
                    }
                }
                if (cancelled) return;
                setRaces(nextRaces);
                setErrors(nextErrors);
                setActiveTrackTab(null);
                setAccountImportLabel(payload.datasetLabel);
                setSelectedTeamFilters({});
            } catch (err: any) {
                if (cancelled) return;
                setRaces([]);
                setErrors([`Failed to load linked-account races: ${err.message ?? String(err)}`]);
                setAccountImportLabel(null);
                setSelectedTeamFilters({});
            } finally {
                if (!cancelled) {
                    setAccountImportLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [searchParams]);

    const trackGroups: TrackGroup[] = useMemo(() => {
        if (races.length === 0) return [];

        const groupMap = new Map<string, {
            courseId: number;
            races: ParsedRace[];
            season?: string | number;
            weather?: string | number;
            groundCondition?: number;
        }>();

        races.forEach((race) => {
            const courseId = race.detectedCourseId ?? 0;
            const groupKey = `${courseId}|${race.season ?? ""}|${race.weather ?? ""}|${race.groundCondition ?? ""}`;
            if (!groupMap.has(groupKey)) {
                groupMap.set(groupKey, {
                    courseId,
                    races: [],
                    season: race.season,
                    weather: race.weather,
                    groundCondition: race.groundCondition,
                });
            }
            groupMap.get(groupKey)!.races.push(race);
        });

        return Array.from(groupMap.entries())
            .map(([groupKey, groupData]) => {
                const stats = aggregateStats(groupData.races);
                const hpSpurtStats = computeHpSpurtStats(groupData.races, undefined, true, undefined, true);
                const { playerTeamOptions, raceIdsByPlayerTeamKey } = buildPlayerTeamFilterData(groupData.races, stats);

                return {
                    groupKey,
                    courseId: groupData.courseId,
                    trackLabel: getTrackLabel(groupData.courseId),
                    conditionLabel: `${getSeasonLabel(groupData.season)} \u00b7 ${getWeatherLabel(groupData.weather)} \u00b7 ${getGroundConditionLabel(groupData.groundCondition)}`,
                    races: groupData.races,
                    stats,
                    hpSpurtStats,
                    playerTeamOptions,
                    raceIdsByPlayerTeamKey,
                };
            })
            .sort((a, b) => b.races.length - a.races.length);
    }, [races]);

    const filteredTrackGroups: FilteredTrackGroup[] = useMemo(() => (
        trackGroups.map((group) => {
            const selectedTeamKey = group.playerTeamOptions.some((option) => option.value === selectedTeamFilters[group.groupKey])
                ? selectedTeamFilters[group.groupKey]
                : "";

            if (!selectedTeamKey) {
                return {
                    ...group,
                    selectedTeamKey,
                    filteredStats: group.stats,
                    filteredHpSpurtStats: group.hpSpurtStats,
                };
            }

            const selectedRaceIds = group.raceIdsByPlayerTeamKey.get(selectedTeamKey);
            const filteredRaces = selectedRaceIds
                ? group.races.filter((race) => selectedRaceIds.has(race.id))
                : group.races;

            return {
                ...group,
                selectedTeamKey,
                filteredStats: aggregateStats(filteredRaces),
                filteredHpSpurtStats: computeHpSpurtStats(filteredRaces, undefined, true, undefined, true),
            };
        })
    ), [selectedTeamFilters, trackGroups]);

    const defaultTrackTab = useMemo(() => {
        if (filteredTrackGroups.length === 0) return null;
        return `track-${filteredTrackGroups[0].groupKey}`;
    }, [filteredTrackGroups]);

    const currentTab = activeTrackTab ?? defaultTrackTab;

    return (
        <div className="multirace-container">
            <RaceUploadZone
                onFilesSelected={handleFilesSelected}
                isProcessing={isProcessing || accountImportLoading}
            />

            {accountImportLoading && (
                <Alert variant="info">
                    <div className="d-flex align-items-center gap-2">
                        <Spinner animation="border" size="sm" />
                        <span>Loading linked-account races into Multi-Race Analysis...</span>
                    </div>
                </Alert>
            )}

            {!accountImportLoading && accountImportLabel && races.length > 0 && (
                <Alert variant="info">
                    Loaded {races.length} race(s) from {accountImportLabel}.
                </Alert>
            )}

            {errors.length > 0 && (
                <Alert variant="warning" dismissible onClose={() => setErrors([])}>
                    <strong>Some files could not be processed:</strong>
                    <ul className="multirace-error-list">
                        {errors.slice(0, 5).map((err, index) => (
                            <li key={index}>{err}</li>
                        ))}
                        {errors.length > 5 && <li>...and {errors.length - 5} more</li>}
                    </ul>
                </Alert>
            )}

            {races.length === 0 && !accountImportLoading && (
                <Alert variant="info">
                    Visit the <a href={HORSEACT_SETUP_URL} target="_blank" rel="noreferrer">horseACT setup guide</a> if you don't know how to get your race data.
                </Alert>
            )}

            {races.length > 0 && (
                <>
                    <RaceListPanel
                        races={races}
                        onRemoveRace={handleRemoveRace}
                        onClearAll={handleClearAll}
                    />

                    {isProcessing ? (
                        <div className="loading-overlay">
                            <Spinner animation="border" variant="primary" />
                            <span className="loading-text">Processing races...</span>
                        </div>
                    ) : filteredTrackGroups.length > 0 ? (
                        <Tab.Container
                            activeKey={currentTab ?? undefined}
                            onSelect={(key) => setActiveTrackTab(key as string)}
                        >
                            <div className="analysis-tabs">
                                <Nav variant="tabs">
                                    {filteredTrackGroups.map((group) => (
                                        <Nav.Item key={group.groupKey}>
                                            <Nav.Link eventKey={`track-${group.groupKey}`}>
                                                {group.trackLabel} {" \u00b7 "} {group.conditionLabel} ({group.races.length})
                                            </Nav.Link>
                                        </Nav.Item>
                                    ))}
                                </Nav>
                            </div>

                            <Tab.Content>
                                {filteredTrackGroups.map((group) => (
                                    <Tab.Pane key={group.groupKey} eventKey={`track-${group.groupKey}`} transition={false}>
                                        <div className="hp-spurt-analysis-section">
                                            <div className="section-heading-row">
                                                <h4 className="section-heading">Personal character analysis</h4>
                                                {group.playerTeamOptions.length > 0 && (
                                                    <div className="multirace-team-filter">
                                                        <TeamSampleSelect
                                                            value={group.selectedTeamKey}
                                                            options={group.playerTeamOptions}
                                                            onChange={(value) => {
                                                                setSelectedTeamFilters((prev) => ({
                                                                    ...prev,
                                                                    [group.groupKey]: value,
                                                                }));
                                                            }}
                                                            strategyColors={STRATEGY_COLORS}
                                                            placeholderLabel="All uploaded teams"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            <HpSpurtAnalysis stats={group.filteredHpSpurtStats} />
                                        </div>

                                        <WinDistributionCharts
                                            characterStats={group.filteredStats.characterStats}
                                            strategyStats={group.filteredStats.strategyStats}
                                            totalRaces={group.filteredStats.totalRaces}
                                            roomCompositions={group.filteredStats.roomCompositions}
                                            allHorses={group.filteredStats.allHorses}
                                            skillStats={group.filteredStats.skillStats}
                                        />

                                        <div className="skill-analysis-section">
                                            <h4 className="section-heading">Skill Analysis</h4>
                                            <SkillAnalysis
                                                skillStats={group.filteredStats.skillStats}
                                                skillActivations={group.filteredStats.skillActivations}
                                                avgRaceDistance={group.filteredStats.avgRaceDistance}
                                                characterStats={group.filteredStats.characterStats}
                                                strategyStats={group.filteredStats.strategyStats}
                                                allHorses={group.filteredStats.allHorses}
                                                ownCharas={group.filteredHpSpurtStats}
                                            />
                                        </div>

                                        <div className="skill-analysis-section">
                                            <h4 className="section-heading">Explorer</h4>
                                            <ExplorerTab
                                                apiMode={false}
                                                skillStats={group.filteredStats.skillStats}
                                            />
                                        </div>
                                    </Tab.Pane>
                                ))}
                            </Tab.Content>
                        </Tab.Container>
                    ) : null}
                </>
            )}
        </div>
    );
};

export default MultiRacePage;
