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
import ExplorerTab from "../UmaLogsPage/ExplorerTab";
import type { AccountDatasetRaceExportResponse } from "../../auth/authShared";

const HORSEACT_SETUP_URL = "https://github.com/ayaliz/horseACT#installation";

// Group races by track
interface TrackGroup {
    groupKey: string;
    courseId: number;
    trackLabel: string;
    conditionLabel: string;
    races: ParsedRace[];
    stats: AggregatedStats;
    hpSpurtStats: CharaHpSpurtStats[];
}

const MultiRacePage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const [races, setRaces] = useState<ParsedRace[]>([]);
    const [errors, setErrors] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeTrackTab, setActiveTrackTab] = useState<string | null>(null);
    const [accountImportLoading, setAccountImportLoading] = useState(false);
    const [accountImportLabel, setAccountImportLabel] = useState<string | null>(null);

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
                    // Check for duplicate (same file name already loaded)
                    const isDuplicate = races.some(r => r.fileName === file.name);
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

        setRaces(prev => [...prev, ...newRaces]);
        setErrors(prev => [...prev, ...newErrors]);
        setIsProcessing(false);
    }, [races]);

    const handleRemoveRace = useCallback((raceId: string) => {
        setRaces(prev => prev.filter(r => r.id !== raceId));
    }, []);

    const handleClearAll = useCallback(() => {
        setRaces([]);
        setErrors([]);
        setActiveTrackTab(null);
        setAccountImportLabel(null);
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
            } catch (err: any) {
                if (cancelled) return;
                setRaces([]);
                setErrors([`Failed to load linked-account races: ${err.message ?? String(err)}`]);
                setAccountImportLabel(null);
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

    // Group races by track and compute stats per track
    const trackGroups: TrackGroup[] = useMemo(() => {
        if (races.length === 0) return [];

        const groupMap = new Map<string, { courseId: number; races: ParsedRace[]; season?: string | number; weather?: string | number; groundCondition?: number }>();

        races.forEach(race => {
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

        const groups: TrackGroup[] = Array.from(groupMap.entries())
            .map(([groupKey, groupData]) => ({
                groupKey,
                courseId: groupData.courseId,
                trackLabel: getTrackLabel(groupData.courseId),
                conditionLabel: `${getSeasonLabel(groupData.season)} · ${getWeatherLabel(groupData.weather)} · ${getGroundConditionLabel(groupData.groundCondition)}`,
                races: groupData.races,
                stats: aggregateStats(groupData.races),
                hpSpurtStats: computeHpSpurtStats(groupData.races, undefined, true, undefined, true),
            }))
            .sort((a, b) => b.races.length - a.races.length); // Sort by number of races descending

        return groups;
    }, [races]);

    // Default to the most common track
    const defaultTrackTab = useMemo(() => {
        if (trackGroups.length === 0) return null;
        return `track-${trackGroups[0].groupKey}`;
    }, [trackGroups]);

    // Use active tab or default
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
                        <span>Loading linked-account races into Multi-Race Analysis…</span>
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
                        {errors.slice(0, 5).map((err, i) => (
                            <li key={i}>{err}</li>
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
                    ) : trackGroups.length > 0 ? (
                        <Tab.Container
                            activeKey={currentTab ?? undefined}
                            onSelect={(key) => setActiveTrackTab(key as string)}
                        >
                            <div className="analysis-tabs">
                                <Nav variant="tabs">
                                    {trackGroups.map((group) => (
                                        <Nav.Item key={group.groupKey}>
                                            <Nav.Link eventKey={`track-${group.groupKey}`}>
                                                {group.trackLabel} · {group.conditionLabel} ({group.races.length})
                                            </Nav.Link>
                                        </Nav.Item>
                                    ))}
                                </Nav>
                            </div>

                            <Tab.Content>
                                {trackGroups.map((group) => (
                                    <Tab.Pane key={group.groupKey} eventKey={`track-${group.groupKey}`} transition={false}>
                                        <div className="hp-spurt-analysis-section">
                                            <h4 className="section-heading">
                                                Personal character analysis
                                            </h4>
                                            <HpSpurtAnalysis stats={group.hpSpurtStats} />
                                        </div>

                                        <WinDistributionCharts
                                            characterStats={group.stats.characterStats}
                                            allHorses={group.stats.allHorses}
                                            skillStats={group.stats.skillStats}
                                        />

                                        <div className="skill-analysis-section">
                                            <h4 className="section-heading">
                                                Skill Analysis
                                            </h4>
                                            <SkillAnalysis
                                                skillStats={group.stats.skillStats}
                                                skillActivations={group.stats.skillActivations}
                                                avgRaceDistance={group.stats.avgRaceDistance}
                                                characterStats={group.stats.characterStats}
                                                strategyStats={group.stats.strategyStats}
                                                allHorses={group.stats.allHorses}
                                                ownCharas={group.hpSpurtStats}
                                            />
                                        </div>

                                        <div className="skill-analysis-section">
                                            <h4 className="section-heading">
                                                Explorer
                                            </h4>
                                            <ExplorerTab
                                                apiMode={false}
                                                skillStats={group.stats.skillStats}
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
