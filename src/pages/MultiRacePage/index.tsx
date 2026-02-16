import React, { useState, useCallback, useMemo } from "react";
import { Alert, Nav, Spinner, Tab } from "react-bootstrap";
import { ParsedRace, AggregatedStats } from "./types";
import { parseRaceJson, aggregateStats, getTrackLabel } from "./utils";
import "./MultiRacePage.css";

import RaceUploadZone from "./components/RaceUploadZone";
import RaceListPanel from "./components/RaceListPanel";
import WinDistributionCharts from "./components/WinDistributionCharts";
import SkillAnalysis from "./components/SkillAnalysis";
import HpSpurtAnalysis from "./components/HpSpurtAnalysis";

// Group races by track
interface TrackGroup {
    courseId: number;
    trackLabel: string;
    races: ParsedRace[];
    stats: AggregatedStats;
}

const MultiRacePage: React.FC = () => {
    const [races, setRaces] = useState<ParsedRace[]>([]);
    const [errors, setErrors] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeTrackTab, setActiveTrackTab] = useState<string | null>(null);

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
    }, []);

    // Group races by track and compute stats per track
    const trackGroups: TrackGroup[] = useMemo(() => {
        if (races.length === 0) return [];

        const groupMap = new Map<number, ParsedRace[]>();

        races.forEach(race => {
            const courseId = race.detectedCourseId ?? 0;
            if (!groupMap.has(courseId)) {
                groupMap.set(courseId, []);
            }
            groupMap.get(courseId)!.push(race);
        });

        const groups: TrackGroup[] = Array.from(groupMap.entries())
            .map(([courseId, trackRaces]) => ({
                courseId,
                trackLabel: getTrackLabel(courseId),
                races: trackRaces,
                stats: aggregateStats(trackRaces),
            }))
            .sort((a, b) => b.races.length - a.races.length); // Sort by number of races descending

        return groups;
    }, [races]);

    // Default to the most common track
    const defaultTrackTab = useMemo(() => {
        if (trackGroups.length === 0) return null;
        return `track-${trackGroups[0].courseId}`;
    }, [trackGroups]);

    // Use active tab or default
    const currentTab = activeTrackTab ?? defaultTrackTab;

    return (
        <div className="multirace-container">

            <RaceUploadZone
                onFilesSelected={handleFilesSelected}
                isProcessing={isProcessing}
            />

            {errors.length > 0 && (
                <Alert variant="warning" dismissible onClose={() => setErrors([])}>
                    <strong>Some files could not be processed:</strong>
                    <ul style={{ marginBottom: 0, marginTop: "8px" }}>
                        {errors.slice(0, 5).map((err, i) => (
                            <li key={i}>{err}</li>
                        ))}
                        {errors.length > 5 && <li>...and {errors.length - 5} more</li>}
                    </ul>
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
                                        <Nav.Item key={group.courseId}>
                                            <Nav.Link eventKey={`track-${group.courseId}`}>
                                                {group.trackLabel} ({group.races.length})
                                            </Nav.Link>
                                        </Nav.Item>
                                    ))}
                                </Nav>
                            </div>

                            <Tab.Content>
                                {trackGroups.map((group) => (
                                    <Tab.Pane key={group.courseId} eventKey={`track-${group.courseId}`}>
                                        <div className="hp-spurt-analysis-section" style={{ marginBottom: '30px' }}>
                                            <h4 style={{ color: "#e2e8f0", marginBottom: "15px" }}>
                                                Personal character analysis
                                            </h4>
                                            <HpSpurtAnalysis races={group.races} />
                                        </div>

                                        <WinDistributionCharts
                                            characterStats={group.stats.characterStats}
                                            strategyStats={group.stats.strategyStats}
                                            allHorses={group.stats.allHorses}
                                        />

                                        <div className="skill-analysis-section">
                                            <h4 style={{ color: "#e2e8f0", marginBottom: "15px" }}>
                                                Skill Analysis
                                            </h4>
                                            <SkillAnalysis
                                                skillStats={group.stats.skillStats}
                                                skillActivations={group.stats.skillActivations}
                                                avgRaceDistance={group.stats.avgRaceDistance}
                                                characterStats={group.stats.characterStats}
                                                strategyStats={group.stats.strategyStats}
                                                allHorses={group.stats.allHorses}
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
