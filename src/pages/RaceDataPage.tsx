import React, { useEffect, useRef, useState } from "react";
import "./RaceDataPage.css";
import { Alert, Button, ButtonGroup, Dropdown, OverlayTrigger, ProgressBar, Tooltip } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import RaceDataPresenter from "../components/RaceDataPresenter";
import { RaceSimulateData } from "../data/race_data_pb";
import { deserializeFromBase64 } from "../data/RaceDataParser";
import { fromRaceHorseData, hydrateCompactRaceHorseData } from "../data/TrainedCharaData";
import { computeSkillPoints } from "../data/skillPoints";
import ShareLinkBox from "../components/ShareLinkBox";
import RaceWinRateResults from "../components/RaceWinRateResults";
import type { ShareCreateResponse } from "../auth/authShared";
import { normalizeSeasonValue } from "../utils/season";
import { buildReplayPresenterInput, type ReplayPayloadResponse } from "../features/umalogs/model/replaysShared";
import UMDatabaseWrapper from "../data/UMDatabaseWrapper";
import GameDataLoader from "../data/GameDataLoader";
import {
    hasHorseActVersionKey,
    isTeamTrialRaceJson,
    normalizeRaceJsonInput,
    parseRaceInstanceIdFromFilename,
    parseStandardRaceJson,
    type TrackDetails,
} from "../data/RaceJsonParser";
import {
    buildAuthoritativeModeEvents,
    buildDetailedHorseMetrics,
    buildSharedDetailedRaceSimulation,
    getDetailedRaceReplacementError,
    getDetailedRaceWhatIfError,
    readDetailedRaceSimulationResponse,
    restoreSharedDetailedRaceSimulation,
    type DetailedRaceSimulationProgress,
    type DetailedRaceSimulationResponse,
    type RaceModeEvent,
} from "../data/DetailedRaceSimulation";
import {
    buildDetailedRaceCaptureFromSharedData,
    getDetailedRaceCaptureRaceInstanceId,
    getDetailedRaceCaptureStartTimeType,
    getDetailedRaceCaptureRaceType,
    resolveDetailedRaceInstanceId,
    anonymizeSharedRaceHorse,
    isDetailedRaceEligible,
    normalizeDetailedRaceCaptureForSimulation,
    buildDetailedRaceSimulationRequest,
} from "../data/DetailedRaceEligibility";
import { buildLobbyRaceView, consumeLobbyRace } from "./SimDataPage/lobby";
import {
    isActiveRaceWinRateBatch,
    type RaceWinRateBatch,
    type RaceWinRateRace,
    type RaceWinRateRunner,
} from "../data/RaceWinRateSimulation";
import { consumeStagedRaceData, stageRaceData } from "../data/StagedRaceData";

const RaceDataPresenterAny = RaceDataPresenter as any;
const HORSEACT_RELEASE_URL = "https://github.com/ayaliz/horseACT/releases/latest";
const HORSEACT_SETUP_URL = "https://github.com/ayaliz/horseACT#installation";
const CURRENT_HORSEACT_VERSION = "1.1.7";

type ShareCache = Record<string, string>;
type SharedRaceData = {
    shareFormatVersion?: number,
    raceHorseInfo: string | any[],
    raceScenario: string,
    detectedCourseId?: number,
    laneDistanceMax?: number,
    randomSeed?: number,
    raceInstanceId?: number,
    startTimeType?: number,
    raceTypeCode?: number,
    raceType?: string,
    trackDetails?: TrackDetails,
    detailedSimulation?: unknown,
};
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
type DetailedRaceView = {
    raceData: RaceSimulateData;
    modeEvents: Record<number, RaceModeEvent[]>;
    response: DetailedRaceSimulationResponse;
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

function createAlternateSeed(originalSeed: number | undefined, currentSeed: number | undefined): number {
    const values = new Int32Array(1);
    crypto.getRandomValues(values);
    let seed = values[0];
    while (seed === originalSeed || seed === currentSeed) {
        seed = seed === 2147483647 ? -2147483648 : seed + 1;
    }
    return seed;
}

export default function RaceDataPage() {
    const location = useLocation();
    const navigate = useNavigate();
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
    const [detailedRaceData, setDetailedRaceData] = useState<RaceSimulateData | undefined>(undefined);
    const [detailedModeEvents, setDetailedModeEvents] = useState<Record<number, RaceModeEvent[]> | undefined>(undefined);
    const [detailedResponse, setDetailedResponse] = useState<DetailedRaceSimulationResponse | undefined>(undefined);
    const [recordedDetailedView, setRecordedDetailedView] = useState<DetailedRaceView | undefined>(undefined);
    const [alternateSeed, setAlternateSeed] = useState<number | undefined>(undefined);
    const [detailedRequestKind, setDetailedRequestKind] = useState<"recorded" | "alternate" | null>(null);
    const [detailedErrorContext, setDetailedErrorContext] = useState<"recorded" | "alternate">("recorded");
    const [detailedStatus, setDetailedStatus] = useState<"idle" | "loading" | "ready">("idle");
    const [detailedProgress, setDetailedProgress] = useState<DetailedRaceSimulationProgress | undefined>(undefined);
    const [detailedError, setDetailedError] = useState("");
    const [useDetailedMode, setUseDetailedMode] = useState(false);
    const [rawRaceCapture, setRawRaceCapture] = useState<Record<string, unknown> | undefined>(undefined);
    const [winRateBatch, setWinRateBatch] = useState<RaceWinRateBatch | undefined>(undefined);
    const [winRateSubmitting, setWinRateSubmitting] = useState(false);
    const [winRateError, setWinRateError] = useState("");
    const activeWinRateBatchRef = useRef<{
        jobId: string;
        accessToken: string;
        heartbeat: string;
        cancel: string;
    } | null>(null);
    const winRatePollControllerRef = useRef<AbortController | null>(null);
    const detailedRequestControllerRef = useRef<AbortController | null>(null);
    const detailedAutoRequestAttemptedRef = useRef(false);
    const isArchiveReplayRoute = Boolean(raceUid);

    const abandonWinRateBatch = () => {
        const active = activeWinRateBatchRef.current;
        activeWinRateBatchRef.current = null;
        winRatePollControllerRef.current?.abort();
        winRatePollControllerRef.current = null;
        if (!active) return;
        const body = JSON.stringify({ accessToken: active.accessToken });
        if (typeof navigator.sendBeacon === "function") {
            navigator.sendBeacon(active.cancel, new Blob([body], { type: "text/plain;charset=UTF-8" }));
        } else {
            void fetch(active.cancel, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=UTF-8" },
                body,
                keepalive: true,
            });
        }
    };

    const resetWinRateEstimate = () => {
        abandonWinRateBatch();
        setWinRateBatch(undefined);
        setWinRateSubmitting(false);
        setWinRateError("");
    };

    useEffect(() => {
        const handlePageHide = () => abandonWinRateBatch();
        window.addEventListener("pagehide", handlePageHide);
        return () => {
            window.removeEventListener("pagehide", handlePageHide);
            detailedRequestControllerRef.current?.abort();
            abandonWinRateBatch();
        };
    }, []);

    useEffect(() => {
        if (raceUid) return;
        const params = new URLSearchParams(location.search);
        const routeState = location.state as { simLobbyToken?: unknown } | null;
        const stateLobbyToken = typeof routeState?.simLobbyToken === 'string'
            ? routeState.simLobbyToken
            : null;
        const stagedToken = params.get('staged');
        if (stagedToken) {
            params.delete('staged');
            const remainingSearch = params.toString();
            navigate({
                pathname: location.pathname,
                search: remainingSearch ? `?${remainingSearch}` : '',
                hash: location.hash,
            }, { replace: true, state: null });
            const staged = consumeStagedRaceData(stagedToken) as SharedRaceData | null;
            if (!staged) {
                setError('This one-time simulated race is no longer available. Choose it again from the race history.');
                return;
            }
            loadSharedData(staged);
            return;
        }
        const lobbyToken = params.get('sim') ?? stateLobbyToken;
        if (lobbyToken) {
            // The token resolves only in this browser session. Remove both the
            // legacy query parameter and navigation state immediately so the
            // visible URL cannot be mistaken for a shareable race link.
            params.delete('sim');
            const remainingSearch = params.toString();
            navigate({
                pathname: location.pathname,
                search: remainingSearch ? `?${remainingSearch}` : '',
                hash: location.hash,
            }, { replace: true, state: null });
            const payload = consumeLobbyRace(lobbyToken);
            if (!payload) {
                setError('This one-time SimData lobby race is no longer available. Build a new lobby from SimData.');
                return;
            }
            try {
                const race = buildLobbyRaceView(payload);
                const replay = deserializeFromBase64(race.raceScenario);
                if (!replay) throw new Error('The simulator replay could not be decoded.');
                finalizeParsing(
                    race.raceHorseInfo,
                    race.raceScenario,
                    race.detectedCourseId,
                    undefined,
                    race.raceType,
                    race.trackDetails,
                    undefined,
                    race.randomSeed,
                    undefined,
                    false,
                );
                const modeEvents = buildAuthoritativeModeEvents(race.detailed);
                setRawRaceCapture({ ...payload.raceInput, race_scenario: payload.replay.data });
                setDetailedRaceData(replay);
                setDetailedModeEvents(modeEvents);
                setDetailedResponse(race.detailed);
                setRecordedDetailedView({ raceData: replay, modeEvents, response: race.detailed });
                setAlternateSeed(undefined);
                setDetailedStatus('ready');
                setUseDetailedMode(true);
            } catch (reason) {
                setError(reason instanceof Error ? reason.message : 'The SimData lobby race could not be opened.');
            }
            return;
        }
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
    }, [location.hash, location.pathname, location.search, location.state, navigate, raceUid]);

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
        setDetailedRaceData(undefined);
        setDetailedModeEvents(undefined);
        setDetailedResponse(undefined);
        setRecordedDetailedView(undefined);
        setAlternateSeed(undefined);
        setDetailedRequestKind(null);
        setDetailedErrorContext("recorded");
        setDetailedStatus("idle");
        setDetailedProgress(undefined);
        setDetailedError("");
        setUseDetailedMode(false);
        setRawRaceCapture(undefined);
        detailedRequestControllerRef.current?.abort();
        detailedRequestControllerRef.current = null;
        detailedAutoRequestAttemptedRef.current = false;
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
                    presenterInput.randomSeed,
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
        resetWinRateEstimate();
        detailedRequestControllerRef.current?.abort();
        detailedRequestControllerRef.current = null;
        detailedAutoRequestAttemptedRef.current = false;
        setDetailedRaceData(undefined);
        setDetailedModeEvents(undefined);
        setDetailedResponse(undefined);
        setRecordedDetailedView(undefined);
        setAlternateSeed(undefined);
        setDetailedRequestKind(null);
        setDetailedErrorContext("recorded");
        setDetailedStatus("idle");
        setDetailedProgress(undefined);
        setDetailedError("");
        setUseDetailedMode(false);
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

    function loadSharedData(data: SharedRaceData) {
        try {
            const horseInfo = typeof data.raceHorseInfo === 'string' ? JSON.parse(data.raceHorseInfo) : data.raceHorseInfo;
            const parsed = deserializeFromBase64(data.raceScenario);
            if (!parsed) { setError('Failed to parse race scenario data from shared link'); return; }
            const horseInfoArray = Array.isArray(horseInfo) ? horseInfo : [horseInfo];
            const sharedDetailedResponse = restoreSharedDetailedRaceSimulation(
                data.detailedSimulation,
                data.raceScenario,
            );
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
            const reconstructedCapture = buildDetailedRaceCaptureFromSharedData({
                ...data,
                raceHorseInfo: horseInfoArray,
            }, UMDatabaseWrapper.raceInstances) ?? undefined;
            if (sharedDetailedResponse) {
                const modeEvents = buildAuthoritativeModeEvents(sharedDetailedResponse);
                setRawRaceCapture(reconstructedCapture);
                setDetailedRaceData(parsed);
                setDetailedModeEvents(modeEvents);
                setDetailedResponse(sharedDetailedResponse);
                setRecordedDetailedView({ raceData: parsed, modeEvents, response: sharedDetailedResponse });
                setAlternateSeed(undefined);
                setDetailedStatus('ready');
                setUseDetailedMode(true);
            } else {
                setRawRaceCapture(reconstructedCapture);
            }
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

    function parseRaceJson(json: any, fileName?: string) {
        json = normalizeRaceJsonInput(json);
        const fileRaceInstanceId = parseRaceInstanceIdFromFilename(fileName);
        if (fileRaceInstanceId !== undefined && getDetailedRaceCaptureRaceInstanceId(json) === null) {
            json = { ...json, race_instance_id: fileRaceInstanceId };
        }

        if (isTeamTrialRaceJson(json)) {
            setRawRaceCapture(undefined);
            parseTeamTrialJson(json);
            return;
        }

        const parsed = parseStandardRaceJson(json, { fileName });
        if ("error" in parsed) {
            setError(parsed.error);
            return;
        }

        setRawRaceCapture(json as Record<string, unknown>);

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
                parseRaceJson(JSON.parse(text), file.name);
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
                parseRaceJson(JSON.parse(String(reader.result ?? '')), file.name);
            } catch (err: any) {
                setError(`Failed to parse JSON: ${err.message}`);
            }
        };
        reader.readAsText(file);
    };

    const resetToUpload = () => {
        resetWinRateEstimate();
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
        setDetailedRaceData(undefined);
        setDetailedModeEvents(undefined);
        setDetailedResponse(undefined);
        setRecordedDetailedView(undefined);
        setAlternateSeed(undefined);
        setDetailedRequestKind(null);
        setDetailedErrorContext("recorded");
        setDetailedStatus("idle");
        setDetailedProgress(undefined);
        setDetailedError("");
        setUseDetailedMode(false);
        setRawRaceCapture(undefined);
        detailedRequestControllerRef.current?.abort();
        detailedRequestControllerRef.current = null;
        detailedAutoRequestAttemptedRef.current = false;
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

        const sharedDetailedSimulation = useDetailedMode && detailedResponse
            ? buildSharedDetailedRaceSimulation(detailedResponse)
            : undefined;
        const sharedRaceScenario = sharedDetailedSimulation
            ? detailedResponse!.replay.data
            : rawScenario;
        const sharedRaceFields = {
            shareFormatVersion: 2,
            raceScenario: sharedRaceScenario,
            detectedCourseId,
            laneDistanceMax,
            randomSeed: sharedDetailedSimulation?.seed ?? randomSeed,
            raceInstanceId: resolveDetailedRaceInstanceId(
                rawRaceCapture, detectedCourseId, UMDatabaseWrapper.raceInstances,
            ) ?? undefined,
            startTimeType: getDetailedRaceCaptureStartTimeType(rawRaceCapture) ?? undefined,
            raceTypeCode: getDetailedRaceCaptureRaceType(rawRaceCapture) ?? undefined,
            raceType,
            trackDetails,
            detailedSimulation: sharedDetailedSimulation,
        };

        let content: string;
        if (anonymous) {
            if (!rawHorseInfo) { alert('Failed to anonymize Uma data.'); return; }
            try {
                const nameMap = new Map<string, string>();
                let anonCounter = 1;
                const anonHorseInfo = rawHorseInfo.map((horse: any) => {
                    const copy = anonymizeSharedRaceHorse(horse);
                    if (typeof copy.trainer_name === "string" && copy.trainer_name) {
                        if (!nameMap.has(copy.trainer_name)) nameMap.set(copy.trainer_name, `Team ${anonCounter++}`);
                        copy.trainer_name = nameMap.get(copy.trainer_name);
                    }
                    if (copy.owner_trainer_name) {
                        copy.owner_trainer_name = copy.trainer_name;
                    }
                    return copy;
                });
                content = JSON.stringify({
                    ...sharedRaceFields,
                    raceHorseInfo: JSON.stringify(anonHorseInfo),
                    salt: Date.now()
                });
            } catch {
                alert('Failed to anonymize Uma data.');
                return;
            }
        } else {
            content = JSON.stringify({
                ...sharedRaceFields,
                raceHorseInfo: JSON.stringify(rawHorseInfo),
            });
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

    const runDetailedSimulation = async (seedOverride?: number) => {
        const isAlternate = seedOverride !== undefined;
        const requestedSeed = isAlternate ? seedOverride : Number(randomSeed);
        if (!rawRaceCapture
            || detailedStatus === "loading"
            || !detailedSimulationEligible
            || (!Number.isInteger(requestedSeed)
                || requestedSeed < -2147483648
                || requestedSeed > 2147483647)) return;
        const controller = new AbortController();
        detailedRequestControllerRef.current?.abort();
        detailedRequestControllerRef.current = controller;
        setDetailedRequestKind(isAlternate ? "alternate" : "recorded");
        setDetailedStatus("loading");
        setDetailedProgress({
            stage: "submitting",
            message: isAlternate
                ? "Sending the what-if race to the simulator"
                : "Sending race to the detailed simulator",
            percent: 10,
        });
        setDetailedError("");
        setDetailedErrorContext(isAlternate ? "alternate" : "recorded");
        try {
            const response = await fetch("/api/races/resimulate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "text/event-stream",
                },
                body: JSON.stringify(buildDetailedRaceSimulationRequest(
                    rawRaceCapture, detectedCourseId, seedOverride, UMDatabaseWrapper.raceInstances,
                )),
                signal: controller.signal,
            });
            const payload = await readDetailedRaceSimulationResponse(response, setDetailedProgress);
            if (controller.signal.aborted) return;
            setDetailedProgress({ stage: "preparing", message: "Preparing detailed race analysis", percent: 96 });
            const replay = deserializeFromBase64(payload.replay.data);
            if (!replay) throw new Error("The simulator replay could not be decoded.");
            const replacementError = isAlternate
                ? getDetailedRaceWhatIfError(parsedRaceData, replay, payload, requestedSeed)
                : getDetailedRaceReplacementError(parsedRaceData, replay, payload, requestedSeed);
            if (replacementError) throw new Error(replacementError);
            const completePayload = payload;
            const modeEvents = buildAuthoritativeModeEvents(completePayload);
            setDetailedRaceData(replay);
            setDetailedModeEvents(modeEvents);
            setDetailedResponse(completePayload);
            if (isAlternate) {
                setAlternateSeed(completePayload.seed);
            } else {
                setRecordedDetailedView({ raceData: replay, modeEvents, response: completePayload });
                setAlternateSeed(undefined);
            }
            setDetailedStatus("ready");
            setDetailedProgress(undefined);
            setUseDetailedMode(true);
        } catch (err: any) {
            if (controller.signal.aborted || err?.name === "AbortError") return;
            setDetailedStatus(detailedRaceData ? "ready" : "idle");
            setDetailedProgress(undefined);
            if (!detailedRaceData) setUseDetailedMode(false);
            setDetailedError(err?.message || "Detailed simulation is temporarily unavailable.");
        } finally {
            setDetailedRequestKind(null);
            if (detailedRequestControllerRef.current === controller) {
                detailedRequestControllerRef.current = null;
            }
        }
    };

    const requestDetailedSimulation = async () => {
        if (detailedRaceData && detailedModeEvents) {
            setUseDetailedMode(true);
            setDetailedError("");
            return;
        }
        await runDetailedSimulation();
    };

    const runAlternateSeedSimulation = () => {
        resetWinRateEstimate();
        const seed = createAlternateSeed(randomSeed, alternateSeed);
        void runDetailedSimulation(seed);
    };

    const viewWinRateRace = async (race: RaceWinRateRace) => {
        if (!Number.isInteger(race.seed)) return;
        const raceTab = window.open('', '_blank');
        if (!raceTab) {
            setWinRateError('The race tab was blocked. Allow pop-ups for this site and try again.');
            return;
        }
        raceTab.document.title = 'Loading race…';
        raceTab.document.body.textContent = 'Loading race…';
        try {
            if (!rawRaceCapture || !detailedSimulationEligible || !parsedRaceData) {
                throw new Error('This race is not available for detailed simulation.');
            }
            const response = await fetch('/api/races/resimulate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                },
                body: JSON.stringify(buildDetailedRaceSimulationRequest(
                    rawRaceCapture, detectedCourseId, race.seed, UMDatabaseWrapper.raceInstances,
                )),
            });
            const payload = await readDetailedRaceSimulationResponse(response, progress => {
                if (!raceTab.closed) raceTab.document.body.textContent = progress.message;
            });
            const replay = deserializeFromBase64(payload.replay.data);
            if (!replay) throw new Error('The simulator replay could not be decoded.');
            const replacementError = getDetailedRaceWhatIfError(parsedRaceData, replay, payload, race.seed);
            if (replacementError) throw new Error(replacementError);
            const staged: SharedRaceData = {
                shareFormatVersion: 2,
                raceHorseInfo: rawHorseInfo ?? parsedHorseInfo ?? [],
                raceScenario: payload.replay.data,
                detectedCourseId,
                laneDistanceMax,
                randomSeed: payload.seed,
                raceType,
                trackDetails,
                detailedSimulation: buildSharedDetailedRaceSimulation(payload),
            };
            const token = stageRaceData(staged);
            if (raceTab.closed) throw new Error('The race tab was closed before the simulation finished.');
            raceTab.location.replace(`/racedata?staged=${encodeURIComponent(token)}`);
        } catch (reason) {
            const message = reason instanceof Error ? reason.message : 'The selected race could not be simulated.';
            if (!raceTab.closed) {
                raceTab.document.title = 'Race simulation failed';
                raceTab.document.body.textContent = `Race simulation failed: ${message}`;
            }
            setWinRateError(message);
        }
    };

    const returnToOriginalRace = () => {
        detailedRequestControllerRef.current?.abort();
        detailedRequestControllerRef.current = null;
        setDetailedRequestKind(null);
        setDetailedProgress(undefined);
        setDetailedError("");
        setDetailedErrorContext("recorded");
        setAlternateSeed(undefined);
        if (recordedDetailedView) {
            setDetailedRaceData(recordedDetailedView.raceData);
            setDetailedModeEvents(recordedDetailedView.modeEvents);
            setDetailedResponse(recordedDetailedView.response);
            setDetailedStatus("ready");
            setUseDetailedMode(true);
        } else {
            setDetailedRaceData(undefined);
            setDetailedModeEvents(undefined);
            setDetailedResponse(undefined);
            setDetailedStatus("idle");
            setUseDetailedMode(false);
        }
    };

    const readWinRateBatchResponse = async (response: Response): Promise<RaceWinRateBatch> => {
        const payload = await response.json().catch(() => ({})) as Partial<RaceWinRateBatch> & { error?: string };
        if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
        if (typeof payload.jobId !== "string" || typeof payload.status !== "string"
            || !payload.links || typeof payload.links.heartbeat !== "string"
            || typeof payload.links.cancel !== "string") {
            throw new Error("The simulator returned an incomplete batch response.");
        }
        return payload as RaceWinRateBatch;
    };

    const pollWinRateBatch = async (active: NonNullable<typeof activeWinRateBatchRef.current>) => {
        let consecutiveErrors = 0;
        while (activeWinRateBatchRef.current?.jobId === active.jobId) {
            await new Promise(resolve => window.setTimeout(resolve, 750));
            if (activeWinRateBatchRef.current?.jobId !== active.jobId) return;
            const controller = new AbortController();
            winRatePollControllerRef.current = controller;
            try {
                const response = await fetch(active.heartbeat, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ accessToken: active.accessToken }),
                    signal: controller.signal,
                });
                const batch = await readWinRateBatchResponse(response);
                consecutiveErrors = 0;
                setWinRateBatch(batch);
                if (!isActiveRaceWinRateBatch(batch)) {
                    activeWinRateBatchRef.current = null;
                    winRatePollControllerRef.current = null;
                    if (batch.status === "failed") setWinRateError(batch.error || "Batch simulation failed.");
                    return;
                }
            } catch (reason) {
                if (controller.signal.aborted || activeWinRateBatchRef.current?.jobId !== active.jobId) return;
                consecutiveErrors += 1;
                if (consecutiveErrors < 4) continue;
                abandonWinRateBatch();
                setWinRateError(reason instanceof Error ? reason.message : "Lost contact with the batch queue.");
                return;
            }
        }
    };

    const runWinRateEstimate = async () => {
        if (!rawRaceCapture || !detailedSimulationEligible || winRateSubmitting
            || isActiveRaceWinRateBatch(winRateBatch)) return;
        const seedStart = createAlternateSeed(randomSeed, winRateBatch?.seedStart);
        setWinRateSubmitting(true);
        setWinRateError("");
        setWinRateBatch(undefined);
        try {
            const raceInstanceId = resolveDetailedRaceInstanceId(
                rawRaceCapture, detectedCourseId, UMDatabaseWrapper.raceInstances,
            );
            const body = {
                capture: normalizeDetailedRaceCaptureForSimulation(rawRaceCapture),
                courseId: detectedCourseId,
                grade: 100,
                time: 2,
                raceCount: 100,
                seed: seedStart,
                ...(raceInstanceId === null ? {} : { raceInstanceId }),
            };
            const idempotencyKey = typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `racedata-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const response = await fetch("/api/races/resimulate/batches", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Idempotency-Key": idempotencyKey,
                },
                body: JSON.stringify(body),
            });
            const batch = await readWinRateBatchResponse(response);
            if (!batch.accessToken) throw new Error("The simulator did not return a batch access token.");
            setWinRateBatch(batch);
            if (isActiveRaceWinRateBatch(batch)) {
                const active = {
                    jobId: batch.jobId,
                    accessToken: batch.accessToken,
                    heartbeat: batch.links.heartbeat,
                    cancel: batch.links.cancel,
                };
                activeWinRateBatchRef.current = active;
                void pollWinRateBatch(active);
            }
        } catch (reason) {
            setWinRateError(reason instanceof Error ? reason.message : "Batch simulation is temporarily unavailable.");
        } finally {
            setWinRateSubmitting(false);
        }
    };

    const cancelWinRateEstimate = async () => {
        const active = activeWinRateBatchRef.current;
        if (!active || winRateSubmitting) return;
        setWinRateSubmitting(true);
        setWinRateError("");
        try {
            const response = await fetch(active.cancel, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accessToken: active.accessToken }),
            });
            const batch = await readWinRateBatchResponse(response);
            setWinRateBatch(batch);
            if (!isActiveRaceWinRateBatch(batch)) activeWinRateBatchRef.current = null;
        } catch (reason) {
            setWinRateError(reason instanceof Error ? reason.message : "Could not cancel the estimate.");
        } finally {
            setWinRateSubmitting(false);
        }
    };

    const selectedTeamTrialRace = teamTrialRaces[selectedTeamTrialIndex];
    const detailedConditionSource = rawRaceCapture ?? {
        season: trackDetails?.season,
        weather: trackDetails?.weather,
        ground_condition: trackDetails?.condition,
    };
    const detailedSimulationEligible = Boolean(rawRaceCapture)
        && isDetailedRaceEligible(
            detectedCourseId,
            parsedHorseInfo,
            detailedConditionSource,
        )
        && (Number.isInteger(randomSeed)
            && Number(randomSeed) >= -2147483648
            && Number(randomSeed) <= 2147483647);

    useEffect(() => {
        if (!detailedSimulationEligible
            || detailedStatus !== "idle"
            || detailedRaceData
            || detailedError
            || detailedAutoRequestAttemptedRef.current
            || !rawRaceCapture) return;
        detailedAutoRequestAttemptedRef.current = true;
        void runDetailedSimulation();
    }, [detailedSimulationEligible, detailedStatus, detailedRaceData, detailedError,
        rawRaceCapture]);

    const simulationUiAvailable = Boolean(
        rawRaceCapture
        && detailedSimulationEligible
        && recordedDetailedView,
    );
    const winRateBatchActive = isActiveRaceWinRateBatch(winRateBatch);
    const whatIfActive = alternateSeed !== undefined || detailedRequestKind === "alternate";
    const horseForWinRateRunner = (runner: RaceWinRateRunner) => parsedHorseInfo?.find(horse => {
        const frameOrder = Number(horse?.frame_order ?? horse?.frameOrder);
        return frameOrder === runner.frameOrder + 1 || frameOrder === runner.gateNumber;
    });

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
                {simulationUiAvailable && (
                    <OverlayTrigger
                        placement="bottom"
                        delay={{ show: 150, hide: 120 }}
                        trigger={["hover", "focus", "click"]}
                        rootClose
                        overlay={(
                            <Tooltip id="rdp-analysis-source-tooltip" className="rdp-analysis-tooltip">
                                <strong>Detailed</strong> reruns the uploaded race with its recorded seed on our
                                server-accurate simulator to provide more exact values for metrics like downhill mode
                                duration, pace up duration and more. <strong>Legacy</strong> estimates those values
                                using heuristics. Detailed mode is only made available after our simulator recreates
                                the exact race; otherwise Legacy remains in use. Detailed mode is currently only
                                available for matches using the CM19 or CM20 specifications.
                            </Tooltip>
                        )}
                    >
                        <div className="rdp-analysis-control" role="group" aria-label="Race analysis source">
                            <span className="rdp-analysis-label">
                                Analysis
                                <button
                                    type="button"
                                    className="rdp-analysis-info"
                                    aria-label="About detailed simulation and legacy heuristics"
                                >
                                    ⓘ
                                </button>
                            </span>
                            <ButtonGroup
                                size="sm"
                                aria-label="Choose race analysis source"
                                onClick={event => event.stopPropagation()}
                            >
                                <Button
                                    variant={useDetailedMode ? "success" : "outline-success"}
                                    onClick={requestDetailedSimulation}
                                    disabled={detailedStatus === "loading"}
                                    aria-pressed={useDetailedMode}
                                >
                                    {detailedStatus === "loading"
                                        ? detailedRequestKind === "alternate" ? "Loading new seed results..." : "Loading detailed…"
                                        : detailedError && !detailedRaceData
                                            ? "Retry detailed"
                                            : whatIfActive ? "New seed" : "Detailed"}
                                </Button>
                                <Button
                                    variant={!useDetailedMode && !whatIfActive ? "secondary" : "outline-secondary"}
                                    onClick={whatIfActive ? returnToOriginalRace : () => setUseDetailedMode(false)}
                                    aria-pressed={!useDetailedMode && !whatIfActive}
                                >
                                    {detailedRequestKind === "alternate"
                                        ? "Cancel what-if"
                                        : whatIfActive ? "Original race" : "Legacy"}
                                </Button>
                            </ButtonGroup>
                        </div>
                    </OverlayTrigger>
                )}
                {simulationUiAvailable && (
                    <Dropdown className="rdp-simulation-menu">
                        <Dropdown.Toggle variant="secondary" size="sm" id="rdp-simulation-features">
                            Simulation features
                        </Dropdown.Toggle>
                        <Dropdown.Menu>
                            <Dropdown.Item
                                onClick={() => void runWinRateEstimate()}
                                disabled={winRateSubmitting || winRateBatchActive}
                            >
                                <span>Estimate win rate</span>
                                <small>Run 100 fresh seeds and get win rates.</small>
                            </Dropdown.Item>
                            <Dropdown.Item
                                onClick={runAlternateSeedSimulation}
                                disabled={detailedStatus === "loading"}
                            >
                                <span>Rerun on different seed</span>
                                <small>Run this race on a different seed.</small>
                            </Dropdown.Item>
                            {whatIfActive && (
                                <>
                                    <Dropdown.Divider />
                                    <Dropdown.Item onClick={returnToOriginalRace}>
                                        <span>Return to original race</span>
                                        <small>Restore the recorded result and seed.</small>
                                    </Dropdown.Item>
                                </>
                            )}
                        </Dropdown.Menu>
                    </Dropdown>
                )}
                {winRateBatchActive && (
                    <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={cancelWinRateEstimate}
                        disabled={winRateSubmitting || winRateBatch?.status === "cancel_requested"}
                    >
                        {winRateBatch?.status === "cancel_requested" ? "Cancelling…" : "Cancel estimate"}
                    </Button>
                )}
                {shareStatus === 'shared' && <ShareLinkBox shareUrl={shareUrl} />}
                {shareError && <span className="text-danger rdp-share-error">{shareError}</span>}
            </div>
        )}

        {error && <div className="text-danger rdp-error">{error}</div>}
        {detailedError && recordedDetailedView && (
            <Alert variant="warning" className="rdp-detailed-status">
                {detailedErrorContext === "alternate" ? "What-if rerun" : "Detailed simulation"} failed: {detailedError}{" "}
                {detailedRaceData
                    ? "The previously validated race remains available."
                    : "The recorded race and its normal analysis remain available."}
            </Alert>
        )}
        {alternateSeed !== undefined && useDetailedMode && (
            <section className="rdp-what-if-status" aria-label="What-if replay active">
                <div>
                    <strong>Race result on seed {alternateSeed}</strong>
                </div>
                <Button variant="outline-secondary" size="sm" onClick={returnToOriginalRace}>
                    Return to original race
                </Button>
            </section>
        )}
        {detailedStatus === "loading" && detailedProgress && recordedDetailedView && (
            <section className="rdp-detailed-progress" aria-live="polite" aria-label={`${detailedRequestKind === "alternate" ? "What-if" : "Detailed"} simulation progress`}>
                <div className="rdp-detailed-progress-header">
                    <strong>{detailedRequestKind === "alternate" ? "What-if simulation" : "Detailed simulation"}</strong>
                    <span>{detailedProgress.message}</span>
                </div>
                <ProgressBar
                    now={detailedProgress.percent}
                    min={0}
                    max={100}
                    animated
                    striped
                    className="rdp-detailed-progress-bar"
                />
                <small>{detailedRequestKind === "alternate"
                    ? "The current race remains visible and will switch to the what-if replay when it is ready."
                    : "The legacy heuristics remain visible and will switch to detailed data automatically."}</small>
            </section>
        )}
        {winRateError && (
            <Alert variant="warning" className="rdp-win-rate-alert">
                Win-rate estimate failed: {winRateError}
            </Alert>
        )}
        {winRateBatch && winRateBatch.status !== "failed" && <RaceWinRateResults
            batch={winRateBatch}
            active={winRateBatchActive}
            onClose={resetWinRateEstimate}
            onViewRace={viewWinRateRace}
            getTeamLabel={(_team, teamIndex, runners) => {
                const teamHorse = runners.map(horseForWinRateRunner).find(Boolean);
                return teamHorse?.trainer_name || teamHorse?.owner_trainer_name || `Team ${teamIndex + 1}`;
            }}
            getRunnerLabel={runner => {
                const horse = horseForWinRateRunner(runner);
                return horse ? UMDatabaseWrapper.raceHorseDisplayName(horse) ?? `Gate ${runner.gateNumber}` : `Gate ${runner.gateNumber}`;
            }}
            getRunnerBuild={runner => {
                const horse = horseForWinRateRunner(runner);
                if (!horse) return undefined;
                const build = fromRaceHorseData(horse);
                return {
                    rankScore: build.rankScore,
                    stats: [build.speed, build.stamina, build.pow, build.guts, build.wiz],
                    skillPoints: computeSkillPoints(new Set(build.skills.map(skill => skill.skillId))),
                    skillIds: build.skills.map(skill => skill.skillId),
                    rawStamina: build.stamina,
                    motivation: Number(horse.motivation),
                    runningStyle: Number(horse.running_style ?? horse.runningStyle) - 1,
                };
            }}
        />}
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
                <PresenterErrorBoundary key={`${useDetailedMode ? `detailed-${alternateSeed ?? detailedResponse?.seed ?? randomSeed}` : "recorded"}-${teamTrialRaces.length > 0 ? `team-trial-boundary-${selectedTeamTrialIndex}` : `race-boundary-${rawScenario.slice(0, 24)}`}`}>
                    <RaceDataPresenterAny
                        key={`${useDetailedMode ? `detailed-${alternateSeed ?? detailedResponse?.seed ?? randomSeed}` : "recorded"}-${teamTrialRaces.length > 0 ? `team-trial-${selectedTeamTrialIndex}` : rawScenario.slice(0, 24)}`}
                        raceHorseInfo={parsedHorseInfo}
                        raceData={useDetailedMode && detailedRaceData ? detailedRaceData : parsedRaceData}
                        authoritativeModeEvents={useDetailedMode ? detailedModeEvents : undefined}
                        authoritativeHorseMetrics={useDetailedMode && detailedResponse
                            ? buildDetailedHorseMetrics(detailedResponse)
                            : undefined}
                        laneDistanceMax={laneDistanceMax}
                        randomSeed={alternateSeed ?? randomSeed}
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
