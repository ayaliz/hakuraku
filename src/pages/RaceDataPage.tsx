import { useEffect, useRef, useState } from "react";
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
import { getCourseAptitudeFilters } from "./MultiRacePage/utils";
import { buildReplayPresenterInput, type ReplayPayloadResponse } from "./UmaLogsPage/replaysShared";

const RaceDataPresenterAny = RaceDataPresenter as any;
const HORSEACT_RELEASE_URL = "https://github.com/ayaliz/horseACT/releases/latest";
const HORSEACT_SETUP_URL = "https://github.com/ayaliz/horseACT#installation";
const CURRENT_HORSEACT_VERSION = "1.1.0";

type ShareCache = Record<string, string>;
type TrackDetails = { condition?: string, weather?: string, season?: string };

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
    const [horseActVersion, setHorseActVersion] = useState<string | undefined>(undefined);
    const [isShared, setIsShared] = useState(false);
    const [raceType, setRaceType] = useState<string | undefined>(undefined);
    const [trackDetails, setTrackDetails] = useState<TrackDetails | undefined>(undefined);
    const [laneDistanceMax, setLaneDistanceMax] = useState<number | undefined>(undefined);
    const [dragOver, setDragOver] = useState(false);
    const [routeReplayLoading, setRouteReplayLoading] = useState(false);
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

    function loadSharedData(data: { raceHorseInfo: string, raceScenario: string, detectedCourseId?: number, laneDistanceMax?: number, raceType?: string, trackDetails?: TrackDetails }) {
        try {
            const horseInfo = typeof data.raceHorseInfo === 'string' ? JSON.parse(data.raceHorseInfo) : data.raceHorseInfo;
            const parsed = deserializeFromBase64(data.raceScenario);
            if (!parsed) { setError('Failed to parse race scenario data from shared link'); return; }
            const horseInfoArray = Array.isArray(horseInfo) ? horseInfo : [horseInfo];
            setParsedHorseInfo(horseInfoArray);
            setParsedRaceData(parsed);
            setRawHorseInfo(horseInfoArray);
            setRawScenario(data.raceScenario);
            setDetectedCourseId(data.detectedCourseId);
            setError('');
            setIsShared(true);
            setRaceType(data.raceType);
            setTrackDetails(data.trackDetails ? {
                ...data.trackDetails,
                season: normalizeSeasonValue(data.trackDetails.season)?.toString(),
            } : undefined);
            setLaneDistanceMax(data.laneDistanceMax);
        } catch (err: any) {
            setError(`Failed to parse shared data: ${err.message}`);
        }
    }

    function finalizeParsing(horseInfo: any[], raceScenario: string, courseId?: number, actVersion?: string, type?: string, tDetails?: TrackDetails, laneDistanceMaxValue?: number) {
        const parsed = deserializeFromBase64(raceScenario);
        if (!parsed) { setError('Failed to parse race scenario data'); return; }
        setParsedHorseInfo(horseInfo);
        setParsedRaceData(parsed);
        setRawHorseInfo(horseInfo);
        setRawScenario(raceScenario);
        setDetectedCourseId(courseId);
        setError('');
        setShareStatus('');
        setShareError('');
        setShareUrl('');
        setHorseActVersion(actVersion);
        setIsShared(false);
        setRaceType(type);
        setTrackDetails(tDetails ? {
            ...tDetails,
            season: normalizeSeasonValue(tDetails.season)?.toString(),
        } : undefined);
        setLaneDistanceMax(laneDistanceMaxValue);
    }

    function parseRaceJson(json: any) {
        if (json['race_scenario'] && Array.isArray(json['race_horse_data_array'])) {
            parseNewFormat(json);
            return;
        }

        const horseActVer = json['horseACT_version'];
        const raceHorseArray = json['<RaceHorse>k__BackingField'];
        if (!Array.isArray(raceHorseArray)) {
            setError('Could not find <RaceHorse>k__BackingField or race_horse_data_array in JSON');
            return;
        }

        let courseId: number | undefined;
        let laneDistanceMaxValue: number | undefined;
        try {
            const courseSet = json['<RaceCourseSet>k__BackingField'];
            if (courseSet) {
                courseId = courseSet['<Id>k__BackingField'] ?? courseSet.Id;
                laneDistanceMaxValue = courseSet['<LaneDistanceMax>k__BackingField'] ?? courseSet.LaneDistanceMax;
            }
        } catch { }
        if (laneDistanceMaxValue === undefined) {
            laneDistanceMaxValue = json['<LaneDistanceMax>k__BackingField'] ?? json.LaneDistanceMax;
        }

        const type = json['<RaceType>k__BackingField'];
        const condition = json['<GroundCondition>k__BackingField'];
        const weather = json['<Weather>k__BackingField'];
        const season = normalizeSeasonValue(json['<Season>k__BackingField'])?.toString();
        const tDetails = { condition, weather, season };

        const horseInfo = raceHorseArray
            .map((member: any) => {
                const horseData = member['_responseHorseData'];
                if (horseData === undefined || horseData === null) return null;
                const trainedChara = member['<TrainedCharaData>k__BackingField'];

                let deck: { position: number, id: number, lb: number, exp: number }[] = [];
                if (trainedChara) {
                    const supportCards = trainedChara['<SupportCardArray>k__BackingField'];
                    if (Array.isArray(supportCards)) {
                        deck = supportCards.map((card: any) => ({
                            position: card['<Position>k__BackingField'],
                            id: card['<SupportCardId>k__BackingField'],
                            lb: card['<LimitBreakCount>k__BackingField'],
                            exp: card['<Exp>k__BackingField']
                        })).sort((a, b) => a.position - b.position);
                    }
                }

                let parents: { positionId: number, cardId: number, rank: number, factors: { id: number, level: number }[] }[] = [];
                if (trainedChara) {
                    const successionList = trainedChara['<SuccessionCharaList>k__BackingField'];
                    if (successionList && Array.isArray(successionList['_items'])) {
                        parents = successionList['_items']
                            .filter((p: any) => p && [10, 11, 12, 20, 21, 22].includes(p['_positionId']))
                            .map((p: any) => ({
                                positionId: p['_positionId'],
                                cardId: p['<CardId>k__BackingField'],
                                rank: p['_rank'],
                                factors: Array.isArray(p['<FactorDataArray>k__BackingField'])
                                    ? p['<FactorDataArray>k__BackingField'].map((f: any) => {
                                        const fId = f['FactorId'] ?? f['<FactorId>k__BackingField'];
                                        return { id: fId, level: fId % 100 };
                                    })
                                    : []
                            }));
                    }
                }

                return { ...horseData, deck, parents };
            })
            .filter((data: any) => data !== null);

        if (horseInfo.length === 0) { setError('No horse data found in _responseHorseData fields'); return; }

        const raceScenario = json['<SimDataBase64>k__BackingField'];
        if (typeof raceScenario !== 'string' || !raceScenario) {
            setError('Could not find <SimDataBase64>k__BackingField in JSON');
            return;
        }

        finalizeParsing(horseInfo, raceScenario, courseId, horseActVer, type, tDetails, laneDistanceMaxValue);
    }

    function parseNewFormat(json: any) {
        try {
            const rawHorses = json['race_horse_data_array'];
            const trainedCharas = json['trained_chara_array'] || [];
            const actVersion = json['horseACT_version'];
            const type = json['race_type'] ?? json['RaceType'];
            const condition = json['ground_condition'] ?? json['GroundCondition'];
            const weather = json['weather'] ?? json['Weather'];
        const season = normalizeSeasonValue(json['season'] ?? json['Season'])?.toString();
        const tDetails = { condition, weather, season };

            let courseId: number | undefined;
            let laneDistanceMaxValue: number | undefined;
            const courseSet = json['race_course_set'] || json['RaceCourseSet'];
            if (courseSet) {
                courseId = courseSet['id'] ?? courseSet.Id;
                laneDistanceMaxValue = courseSet['lane_distance_max'] ?? courseSet.LaneDistanceMax;
            }
            if (laneDistanceMaxValue === undefined) {
                laneDistanceMaxValue = json['lane_distance_max'] ?? json.LaneDistanceMax;
            }

            const courseAptitudeFilters = getCourseAptitudeFilters(courseId);
            const horseInfo = rawHorses.map((horseData: any, index: number) => {
                if (!horseData) return null;
                const trainedChara = trainedCharas[index];

                let deck: { position: number, id: number, lb: number, exp: number }[] = [];
                let parents: { positionId: number, cardId: number, rank: number, factors: { id: number, level: number }[] }[] = [];

                if (trainedChara) {
                    const supportCards = trainedChara['support_card_array'] || trainedChara['support_card_list'] || trainedChara['SupportCardArray'];
                    if (Array.isArray(supportCards)) {
                        deck = supportCards.map((card: any, cardIndex: number) => ({
                            position: card['position'] ?? card['Position'] ?? (cardIndex + 1),
                            id: card['support_card_id'] ?? card['SupportCardId'],
                            lb: card['limit_break_count'] ?? card['LimitBreakCount'],
                            exp: card['exp'] ?? card['Exp']
                        })).sort((a: any, b: any) => a.position - b.position);
                    }

                    const successionList = trainedChara['succession_chara_list'] || trainedChara['SuccessionCharaList'];
                    if (Array.isArray(successionList)) {
                        parents = successionList
                            .filter((p: any) => {
                                const posId = p['position_id'] ?? p['PositionId'];
                                return [10, 11, 12, 20, 21, 22].includes(posId);
                            })
                            .map((p: any) => {
                                const factorArray = p['factor_data_array'] || p['FactorDataArray'];
                                return {
                                    positionId: p['position_id'] ?? p['PositionId'],
                                    cardId: p['card_id'] ?? p['CardId'],
                                    rank: p['rank'] ?? p['Rank'],
                                    factors: Array.isArray(factorArray)
                                        ? factorArray.map((f: any) => {
                                            const fId = f['factor_id'] ?? f['FactorId'];
                                            return { id: fId, level: fId % 100 };
                                        })
                                        : []
                                };
                            });
                    }
                }

                return { ...hydrateCompactRaceHorseData(horseData, { courseAptitudeFilters }), deck, parents };
            }).filter((h: any) => h !== null);

            finalizeParsing(horseInfo, json['race_scenario'], courseId, actVersion, type, tDetails, laneDistanceMaxValue);
        } catch (err: any) {
            setError(`Failed to parse new JSON format: ${err.message}`);
        }
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
                    return copy;
                });
                content = JSON.stringify({
                    raceHorseInfo: JSON.stringify(anonHorseInfo),
                    raceScenario: rawScenario,
                    detectedCourseId,
                    laneDistanceMax,
                    raceType,
                    trackDetails,
                    salt: Date.now()
                });
            } catch {
                alert('Failed to anonymize horse data.');
                return;
            }
        } else {
            content = JSON.stringify({ raceHorseInfo: JSON.stringify(rawHorseInfo), raceScenario: rawScenario, detectedCourseId, laneDistanceMax, raceType, trackDetails });
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

        {parsedRaceData && parsedHorseInfo ? (
            <>
                {(!isArchiveReplayRoute && !isShared && isHorseActOutdated(horseActVersion)) && <Alert variant="info">
                    The version of horseACT used to generate this file appears to be outdated. The current release is {CURRENT_HORSEACT_VERSION}, available at <a href={HORSEACT_RELEASE_URL} target="_blank" rel="noreferrer">{HORSEACT_RELEASE_URL}</a>. It's recommended to update by replacing your existing horseACT.dll.
                </Alert>}
                <RaceDataPresenterAny
                    raceHorseInfo={parsedHorseInfo}
                    raceData={parsedRaceData}
                    laneDistanceMax={laneDistanceMax}
                    raceType={raceType}
                    trackDetails={trackDetails}
                    detectedCourseId={detectedCourseId} />
            </>
        ) : (
            <Alert variant="info">
                Visit the <a href={HORSEACT_SETUP_URL} target="_blank" rel="noreferrer">horseACT setup guide</a> if you don't know how to get your race data.
            </Alert>
        )}
    </div>;
}
