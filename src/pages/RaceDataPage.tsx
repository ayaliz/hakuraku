import React, { useEffect, useRef, useState } from "react";
import "./RaceDataPage.css";
import { Alert, Button } from "react-bootstrap";
import { useLocation, useParams } from "react-router-dom";
import RaceDataPresenter from "../components/RaceDataPresenter";
import { RaceSimulateData } from "../data/race_data_pb";
import { deserializeFromBase64 } from "../data/RaceDataParser";
import { hydrateCompactRaceHorseData } from "../data/TrainedCharaData";
import ShareLinkBox from "../components/ShareLinkBox";
import type { ShareCreateResponse } from "../auth/authShared";
import { normalizeSeasonValue } from "../utils/season";
import { buildReplayPresenterInput, type ReplayPayloadResponse } from "./UmaLogsPage/replaysShared";
import UMDatabaseWrapper from "../data/UMDatabaseWrapper";
import GameDataLoader from "../data/GameDataLoader";
import {
    hasHorseActVersionKey,
    isTeamTrialRaceJson,
    normalizeRaceJsonInput,
    parseStandardRaceJson,
    type TrackDetails,
} from "../data/RaceJsonParser";

const RaceDataPresenterAny = RaceDataPresenter as any;
const HORSEACT_RELEASE_URL = "https://github.com/ayaliz/horseACT/releases/latest";
const HORSEACT_SETUP_URL = "https://github.com/ayaliz/horseACT#installation";
const CURRENT_HORSEACT_VERSION = "1.1.7";

type ShareCache = Record<string, string>;
type ParsedRaceView = {
    label: string,
    raceHorseInfo: any[],
    raceData: RaceSimulateData,
    raceScenario: string,
    playerFrameOrder?: number,
    detectedCourseId?: number,
    laneDistanceMax?: number,
    randomSeed?: number,
    hasHorseActVersion?: boolean,
    horseActVersion?: string,
    raceType?: string,
    trackDetails?: TrackDetails,
    round?: number,
    teamTotalScore?: number,
    winType?: number,
};
type PresenterErrorBoundaryProps = {
    children: React.ReactNode,
};
type PresenterErrorBoundaryState = {
    error: Error | null,
};

class PresenterErrorBoundary extends React.Component<PresenterErrorBoundaryProps, PresenterErrorBoundaryState> {
    state: PresenterErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): PresenterErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error("Race presenter crashed:", error, info);
    }

    render() {
        if (this.state.error) {
            return (
                <Alert variant="danger" className="rdp-presenter-error">
                    <Alert.Heading>Could not render this race</Alert.Heading>
                    <p className="mb-0">{this.state.error.message}</p>
                </Alert>
            );
        }

        return this.props.children;
    }
}

function getCourseAptitudeFilters(courseId: number | undefined): { ground: number; distance: number } | null {
    if (!courseId) return null;
    const course = (GameDataLoader.courseData as Record<string, any>)[String(courseId)];
    if (!course) return null;
    const ground = course.surface as number;
    const m = course.distance as number;
    const distance = m <= 1400 ? 1 : m <= 1800 ? 2 : m <= 2400 ? 3 : 4;
    return { ground, distance };
}

function normalizeTrainerNameForDisplay(horse: any): any {
    if (!horse || typeof horse !== "object") return horse;
    const ownerTrainerName = typeof horse.owner_trainer_name === "string"
        ? horse.owner_trainer_name.trim()
        : "";
    if (!ownerTrainerName) return horse;
    return {
        ...horse,
        trainer_name: ownerTrainerName,
    };
}

function normalizeTrainerNamesForDisplay(horses: any[]): any[] {
    return horses.map(normalizeTrainerNameForDisplay);
}

const bufferToHex = (buf: ArrayBuffer): string =>
    Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

const hashPayload = async (payload: string): Promise<string> => {
    try {
        const enc = new TextEncoder();
        const digest = await crypto.subtle.digest('SHA-256', enc.encode(payload));
        return bufferToHex(digest);
    } catch {
        let h = 2166136261;
        for (let i = 0; i < payload.length; i++) {
            h ^= payload.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(16);
    }
};

export default function RaceDataPage() {
    const location = useLocation();
    const { raceUid } = useParams<{ raceUid?: string }>();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [parsedHorseInfo, setParsedHorseInfo] = useState<any[] | undefined>(undefined);
    const [parsedRaceData, setParsedRaceData] = useState<RaceSimulateData | undefined>(undefined);
    const [error, setError] = useState('');
    const [rawHorseInfo, setRawHorseInfo] = useState<any[] | undefined>(undefined);
    const [rawScenario, setRawScenario] = useState('');
    const [detectedCourseId, setDetectedCourseId] = useState<number | undefined>(undefined);
    const [shareStatus, setShareStatus] = useState<'' | 'sharing' | 'shared'>('');
    const [shareError, setShareError] = useState('');
    const [shareUrl, setShareUrl] = useState('');
    const [shareCache, setShareCache] = useState<ShareCache>({});
    const [hasHorseActVersion, setHasHorseActVersion] = useState(false);
    const [horseActVersion, setHorseActVersion] = useState<string | undefined>(undefined);
    const [isShared, setIsShared] = useState(false);
    const [raceType, setRaceType] = useState<string | undefined>(undefined);
    const [playerFrameOrder, setPlayerFrameOrder] = useState<number | undefined>(undefined);
    const [trackDetails, setTrackDetails] = useState<TrackDetails | undefined>(undefined);
    const [laneDistanceMax, setLaneDistanceMax] = useState<number | undefined>(undefined);
    const [randomSeed, setRandomSeed] = useState<number | undefined>(undefined);
    const [dragOver, setDragOver] = useState(false);
    const [routeReplayLoading, setRouteReplayLoading] = useState(false);
    const [teamTrialRaces, setTeamTrialRaces] = useState<ParsedRaceView[]>([]);
    const [selectedTeamTrialIndex, setSelectedTeamTrialIndex] = useState(0);
    const isArchiveReplayRoute = Boolean(raceUid);

    useEffect(() => {
        if (raceUid) return;
        const params = new URLSearchParams(location.search);
        const kvKey = params.get('kv');
        if (kvKey) {
            fetch(`/api/share/${encodeURIComponent(kvKey)}`)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then(data => loadSharedData(data))
                .catch(err => {
                    console.error(err);
                    setError(`Failed to load shared data: ${err.message}`);
                });
        }
    }, [location.search, raceUid]);

    useEffect(() => {
        if (!raceUid) return;
        const controller = new AbortController();
        setRouteReplayLoading(true);
        setError("");
        setParsedHorseInfo(undefined);
        setParsedRaceData(undefined);
        setRawHorseInfo(undefined);
        setRawScenario("");
        setRandomSeed(undefined);
        setTeamTrialRaces([]);
        setSelectedTeamTrialIndex(0);
        fetch(`/api/races/${encodeURIComponent(raceUid)}/replay`, { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
                return response.json() as Promise<ReplayPayloadResponse>;
            })
            .then((payload) => {
                const presenterInput = buildReplayPresenterInput(payload);
                finalizeParsing(
                    presenterInput.raceHorseInfo,
                    presenterInput.raceScenario,
                    presenterInput.detectedCourseId,
                    payload.replay.horseACTVersion,
                    presenterInput.raceType,
                    presenterInput.trackDetails,
                    presenterInput.laneDistanceMax,
                    undefined,
                );
                setRouteReplayLoading(false);
            })
            .catch((err: any) => {
                if (err?.name === "AbortError") return;
                setError(`Failed to load replay: ${err.message}`);
                setRouteReplayLoading(false);
            });
        return () => controller.abort();
    }, [raceUid]);

    function applyParsedRaceView(
        race: ParsedRaceView,
        options?: { isShared?: boolean, teamTrialRaces?: ParsedRaceView[], selectedTeamTrialIndex?: number },
    ) {
        const raceHorseInfo = normalizeTrainerNamesForDisplay(race.raceHorseInfo);
        setParsedHorseInfo(raceHorseInfo);
        setParsedRaceData(race.raceData);
        setRawHorseInfo(raceHorseInfo);
        setRawScenario(race.raceScenario);
        setDetectedCourseId(race.detectedCourseId);
        setError('');
        setShareStatus('');
        setShareError('');
        setShareUrl('');
        setHasHorseActVersion(Boolean(race.hasHorseActVersion));
        setHorseActVersion(race.horseActVersion);
        setIsShared(options?.isShared ?? false);
        setRaceType(race.raceType);
        setPlayerFrameOrder(race.playerFrameOrder);
        setTrackDetails(race.trackDetails ? {
            ...race.trackDetails,
            season: normalizeSeasonValue(race.trackDetails.season)?.toString(),
        } : undefined);
        setLaneDistanceMax(race.laneDistanceMax);
        setRandomSeed(race.randomSeed);

        if (options?.teamTrialRaces) {
            setTeamTrialRaces(options.teamTrialRaces);
            setSelectedTeamTrialIndex(options.selectedTeamTrialIndex ?? 0);
        } else {
            setTeamTrialRaces([]);
            setSelectedTeamTrialIndex(0);
        }
    }

    function loadSharedData(data: { raceHorseInfo: string, raceScenario: string, detectedCourseId?: number, laneDistanceMax?: number, randomSeed?: number, raceType?: string, trackDetails?: TrackDetails }) {
        try {
            const horseInfo = typeof data.raceHorseInfo === 'string' ? JSON.parse(data.raceHorseInfo) : data.raceHorseInfo;
            const parsed = deserializeFromBase64(data.raceScenario);
            if (!parsed) { setError('Failed to parse race scenario data from shared link'); return; }
            const horseInfoArray = Array.isArray(horseInfo) ? horseInfo : [horseInfo];
            applyParsedRaceView({
                label: 'Shared race',
                raceHorseInfo: horseInfoArray,
                raceData: parsed,
                raceScenario: data.raceScenario,
                detectedCourseId: data.detectedCourseId,
                laneDistanceMax: data.laneDistanceMax,
                randomSeed: data.randomSeed,
                raceType: data.raceType,
                trackDetails: data.trackDetails,
            }, { isShared: true });
        } catch (err: any) {
            setError(`Failed to parse shared data: ${err.message}`);
        }
    }

    function finalizeParsing(horseInfo: any[], raceScenario: string, courseId?: number, actVersion?: string, type?: string, tDetails?: TrackDetails, laneDistanceMaxValue?: number, randomSeedValue?: number, playerFrameOrderValue?: number, hasActVersion?: boolean) {
        const parsed = deserializeFromBase64(raceScenario);
        if (!parsed) { setError('Failed to parse race scenario data'); return; }
        applyParsedRaceView({
            label: 'Race',
            raceHorseInfo: horseInfo,
            raceData: parsed,
            raceScenario,
            playerFrameOrder: playerFrameOrderValue,
            detectedCourseId: courseId,
            hasHorseActVersion: hasActVersion,
            horseActVersion: actVersion,
            raceType: type,
            trackDetails: tDetails,
            laneDistanceMax: laneDistanceMaxValue,
            randomSeed: randomSeedValue,
        });
    }

    function parseTeamTrialRace(json: any, index: number): ParsedRaceView | { error: string } {
        const start = json.race_start_params_array?.[index];
        const result = json.race_result_array?.[index];
        if (!start || !result) return { error: `Team Trial race ${index + 1} is missing start or result data` };
        if (!Array.isArray(start.race_horse_data_array)) return { error: `Team Trial race ${index + 1} has no race_horse_data_array` };
        if (typeof result.race_scenario !== 'string' || !result.race_scenario) return { error: `Team Trial race ${index + 1} has no race_scenario` };

        const raceData = deserializeFromBase64(result.race_scenario);
        if (!raceData) return { error: `Failed to parse Team Trial race ${index + 1} scenario data` };

        const raceInstanceId = Number(start.race_instance_id);
        const courseId = Number.isFinite(raceInstanceId)
            ? UMDatabaseWrapper.raceInstanceCourseSetId[raceInstanceId]
            : undefined;
        const courseAptitudeFilters = getCourseAptitudeFilters(courseId);
        const charaResults = Array.isArray(result.chara_result_array) ? result.chara_result_array : [];
        const resultByTrainedCharaId = new Map<number, any>();
        const resultByFrameOrder = new Map<number, any>();
        charaResults.forEach((charaResult: any) => {
            const trainedCharaId = Number(charaResult?.trained_chara_id);
            const frameOrder = Number(charaResult?.frame_order);
            if (Number.isFinite(trainedCharaId)) resultByTrainedCharaId.set(trainedCharaId, charaResult);
            if (Number.isFinite(frameOrder)) resultByFrameOrder.set(frameOrder, charaResult);
        });
        const raceHorseInfo = start.race_horse_data_array
            .filter((horse: any) => horse !== null)
            .map((horse: any, horseIndex: number) => {
                const startFrameOrder = Number(horse?.frame_order);
                const trainedCharaId = Number(horse?.trained_chara_id);
                const charaResult = resultByTrainedCharaId.get(trainedCharaId)
                    ?? resultByFrameOrder.get(startFrameOrder);
                const resultFrameOrder = Number(charaResult?.frame_order);
                const frameOrder = Number.isFinite(resultFrameOrder) && resultFrameOrder > 0
                    ? resultFrameOrder
                    : Number.isFinite(startFrameOrder) && startFrameOrder > 0
                        ? startFrameOrder
                        : horseIndex + 1;
                return {
                    ...hydrateCompactRaceHorseData(horse, { courseAptitudeFilters }),
                    frame_order: frameOrder,
                    finish_order: charaResult?.finish_order,
                    finish_time: charaResult?.finish_time,
                    team_score_array: charaResult?.score_array,
                };
            })
            .filter((horse: any) => {
                const frameOrder = Number(horse?.frame_order);
                return Number.isFinite(frameOrder) && frameOrder >= 1 && frameOrder <= raceData.horseResult.length;
            })
            .sort((a: any, b: any) => Number(a.frame_order) - Number(b.frame_order));

        if (raceHorseInfo.length === 0) {
            return { error: `Team Trial race ${index + 1} did not include any runners matching the replay data` };
        }

        const round = Number(result.round ?? start.round ?? index + 1);
        const teamTotalScore = Number(result.team_total_score);
        const scoreLabel = Number.isFinite(teamTotalScore) ? ` - ${teamTotalScore.toLocaleString()} pts` : '';
        const label = `Race ${Number.isFinite(round) ? round : index + 1}${scoreLabel}`;
        const parsedRandomSeed = Number(start.random_seed ?? start.randomSeed ?? result.random_seed ?? result.randomSeed);

        return {
            label,
            raceHorseInfo,
            raceData,
            raceScenario: result.race_scenario,
            detectedCourseId: courseId,
            hasHorseActVersion: hasHorseActVersionKey(json),
            horseActVersion: json.horseACT_version,
            randomSeed: Number.isFinite(parsedRandomSeed) ? parsedRandomSeed : undefined,
            raceType: 'Team Trials',
            trackDetails: {
                condition: start.ground_condition?.toString(),
                weather: start.weather?.toString(),
                season: normalizeSeasonValue(start.season)?.toString(),
            },
            round: Number.isFinite(round) ? round : index + 1,
            teamTotalScore: Number.isFinite(teamTotalScore) ? teamTotalScore : undefined,
            winType: typeof result.win_type === 'number' ? result.win_type : undefined,
        };
    }

    function parseTeamTrialJson(json: any) {
        const starts = json.race_start_params_array;
        const results = json.race_result_array;
        if (!Array.isArray(starts) || !Array.isArray(results)) {
            setError('Could not find Team Trial race_start_params_array or race_result_array in JSON');
            return;
        }

        const count = Math.min(starts.length, results.length);
        if (count === 0) {
            setError('Team Trial file did not include any races');
            return;
        }

        const races: ParsedRaceView[] = [];
        for (let index = 0; index < count; index += 1) {
            const parsed = parseTeamTrialRace(json, index);
            if ('error' in parsed) {
                setError(parsed.error);
                return;
            }
            races.push(parsed);
        }

        applyParsedRaceView(races[0], { teamTrialRaces: races, selectedTeamTrialIndex: 0 });
    }

    function selectTeamTrialRace(index: number) {
        const race = teamTrialRaces[index];
        if (!race) return;
        applyParsedRaceView(race, { teamTrialRaces, selectedTeamTrialIndex: index });
    }

    function parseRaceJson(json: any) {
        json = normalizeRaceJsonInput(json);

        if (isTeamTrialRaceJson(json)) {
            parseTeamTrialJson(json);
            return;
        }

        const parsed = parseStandardRaceJson(json);
        if ("error" in parsed) {
            setError(parsed.error);
            return;
        }

        finalizeParsing(
            parsed.horseInfo,
            parsed.raceScenario,
            parsed.detectedCourseId,
            parsed.horseActVersion,
            parsed.raceType,
            parsed.trackDetails,
            parsed.laneDistanceMax,
            parsed.randomSeed,
            parsed.playerFrameOrder,
            parsed.hasHorseActVersion,
        );
    }

    const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!/\.json$/i.test(file.name)) { alert('Please choose a .json file.'); e.target.value = ''; return; }

        const reader = new FileReader();
        reader.onerror = () => { alert('Failed to read the file.'); e.target.value = ''; };
        reader.onload = () => {
            try {
                const text = String(reader.result ?? '');
                parseRaceJson(JSON.parse(text));
            } catch (err: any) {
                setError(`Failed to parse JSON: ${err.message}`);
            }
            e.target.value = '';
        };
        reader.readAsText(file);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        if (!/\.json$/i.test(file.name)) { alert('Please drop a .json file.'); return; }

        const reader = new FileReader();
        reader.onerror = () => alert('Failed to read the file.');
        reader.onload = () => {
            try {
                parseRaceJson(JSON.parse(String(reader.result ?? '')));
            } catch (err: any) {
                setError(`Failed to parse JSON: ${err.message}`);
            }
        };
        reader.readAsText(file);
    };

    const resetToUpload = () => {
        setParsedHorseInfo(undefined);
        setParsedRaceData(undefined);
        setError('');
        setRawHorseInfo(undefined);
        setRawScenario('');
        setDetectedCourseId(undefined);
        setShareStatus('');
        setShareError('');
        setShareUrl('');
        setShareCache({});
        setHasHorseActVersion(false);
        setHorseActVersion(undefined);
        setIsShared(false);
        setRaceType(undefined);
        setPlayerFrameOrder(undefined);
        setTrackDetails(undefined);
        setLaneDistanceMax(undefined);
        setRandomSeed(undefined);
        setDragOver(false);
        setTeamTrialRaces([]);
        setSelectedTeamTrialIndex(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const share = async (anonymous: boolean) => {
        if (!rawScenario) { alert('No race data loaded.'); return; }

        if (isArchiveReplayRoute) {
            const canonicalUrl = `${window.location.origin}${location.pathname}`;
            setShareStatus('shared');
            setShareError('');
            setShareUrl(canonicalUrl);
            return;
        }

        let content: string | null;
        if (anonymous) {
            if (!rawHorseInfo) { alert('Failed to anonymize horse data.'); return; }
            try {
                const nameMap = new Map<string, string>();
                let anonCounter = 1;
                const anonHorseInfo = rawHorseInfo.map((horse: any) => {
                    const copy = { ...horse };
                    copy.viewer_id = 0;
                    if (copy.trainer_name) {
                        if (!nameMap.has(copy.trainer_name)) nameMap.set(copy.trainer_name, `Team ${anonCounter++}`);
                        copy.trainer_name = nameMap.get(copy.trainer_name);
                    }
                    if (copy.owner_trainer_name) {
                        copy.owner_trainer_name = copy.trainer_name;
                    }
                    return copy;
                });
                content = JSON.stringify({
                    raceHorseInfo: JSON.stringify(anonHorseInfo),
                    raceScenario: rawScenario,
                    detectedCourseId,
                    laneDistanceMax,
                    randomSeed,
                    raceType,
                    trackDetails,
                    salt: Date.now()
                });
            } catch {
                alert('Failed to anonymize horse data.');
                return;
            }
        } else {
            content = JSON.stringify({ raceHorseInfo: JSON.stringify(rawHorseInfo), raceScenario: rawScenario, detectedCourseId, laneDistanceMax, randomSeed, raceType, trackDetails });
        }

        const hash = await hashPayload(content);
        const cachedUrl = shareCache[hash];
        if (cachedUrl) { setShareStatus('shared'); setShareError(''); setShareUrl(cachedUrl); return; }

        setShareStatus('sharing');
        setShareError('');
        try {
            const parsedPayload = JSON.parse(content);
            const res = await fetch('/api/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shareType: 'race-upload',
                    anonymous,
                    payload: parsedPayload,
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const { url } = await res.json() as ShareCreateResponse;
            setShareStatus('shared');
            setShareUrl(url);
            setShareCache(prev => ({ ...prev, [hash]: url }));
        } catch (err: any) {
            setShareStatus('');
            setShareError(err.message);
        }
    };

    const isHorseActOutdated = (ver: string | undefined) => {
        if (!ver) return true;
        const parseVersion = (value: string) =>
            value.split('.').map(part => Number.parseInt(part, 10) || 0);
        const current = parseVersion(CURRENT_HORSEACT_VERSION);
        const actual = parseVersion(ver);
        const length = Math.max(current.length, actual.length);
        for (let index = 0; index < length; index += 1) {
            const actualPart = actual[index] ?? 0;
            const currentPart = current[index] ?? 0;
            if (actualPart !== currentPart) {
                return actualPart < currentPart;
            }
        }
        return false;
    };

    const selectedTeamTrialRace = teamTrialRaces[selectedTeamTrialIndex];

    return <div className="rdp-root">
        <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="rdp-file-input"
            onChange={handleFileChange}
        />

        {routeReplayLoading ? (
            <div className="p-4 text-center">
                <Button variant="secondary" size="sm" disabled>
                    Loading replay...
                </Button>
            </div>
        ) : !parsedRaceData ? (
            <div
                className={`upload-zone${dragOver ? ' drag-over' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
            >
                <div className="upload-icon">📂</div>
                <div className="upload-label">Drop a .json race file here, or click to browse</div>
            </div>
        ) : (
            <div className="action-bar">
                {!isArchiveReplayRoute && (
                    <Button variant="outline-secondary" size="sm" onClick={resetToUpload}>
                        Clear
                    </Button>
                )}
                <Button variant="primary" size="sm" onClick={() => fileInputRef.current?.click()}>
                    Upload new race
                </Button>
                <Button variant="secondary" size="sm" onClick={() => share(false)} disabled={shareStatus === 'sharing'}>
                    {shareStatus === 'sharing' ? 'Sharing...' : 'Share'}
                </Button>
                {!isArchiveReplayRoute ? (
                    <Button variant="secondary" size="sm" onClick={() => share(true)} disabled={shareStatus === 'sharing'}>
                        Share (anonymous)
                    </Button>
                ) : null}
                {shareStatus === 'shared' && <ShareLinkBox shareUrl={shareUrl} />}
                {shareError && <span className="text-danger rdp-share-error">{shareError}</span>}
            </div>
        )}

        {error && <div className="text-danger rdp-error">{error}</div>}

        {teamTrialRaces.length > 1 && (
            <div className="rdp-team-trial-switcher" aria-label="Team Trial race selector">
                <div className="rdp-team-trial-summary">
                    <span>Team Trial</span>
                    {selectedTeamTrialRace?.teamTotalScore !== undefined && (
                        <span>{selectedTeamTrialRace.teamTotalScore.toLocaleString()} pts</span>
                    )}
                </div>
                <div className="rdp-team-trial-buttons">
                    {teamTrialRaces.map((race, index) => (
                        <Button
                            key={`${race.round ?? index}-${index}`}
                            variant={index === selectedTeamTrialIndex ? "primary" : "outline-secondary"}
                            size="sm"
                            onClick={() => selectTeamTrialRace(index)}
                        >
                            {race.label}
                        </Button>
                    ))}
                </div>
            </div>
        )}

        {parsedRaceData && parsedHorseInfo ? (
            <>
                {(!isArchiveReplayRoute && !isShared && hasHorseActVersion && isHorseActOutdated(horseActVersion)) && <Alert variant="info">
                    The version of horseACT used to generate this file appears to be outdated. The current release is {CURRENT_HORSEACT_VERSION}, available at <a href={HORSEACT_RELEASE_URL} target="_blank" rel="noreferrer">{HORSEACT_RELEASE_URL}</a>. It's recommended to update by replacing your existing horseACT.dll.
                </Alert>}
                <PresenterErrorBoundary key={teamTrialRaces.length > 0 ? `team-trial-boundary-${selectedTeamTrialIndex}` : `race-boundary-${rawScenario.slice(0, 24)}`}>
                    <RaceDataPresenterAny
                        key={teamTrialRaces.length > 0 ? `team-trial-${selectedTeamTrialIndex}` : rawScenario.slice(0, 24)}
                        raceHorseInfo={parsedHorseInfo}
                        raceData={parsedRaceData}
                        laneDistanceMax={laneDistanceMax}
                        randomSeed={randomSeed}
                        raceType={raceType}
                        playerFrameOrder={playerFrameOrder}
                        trackDetails={trackDetails}
                        detectedCourseId={detectedCourseId} />
                </PresenterErrorBoundary>
            </>
        ) : (
            <Alert variant="info">
                Visit the <a href={HORSEACT_SETUP_URL} target="_blank" rel="noreferrer">horseACT setup guide</a> if you don't know how to get your race data.
            </Alert>
        )}
    </div>;
}
