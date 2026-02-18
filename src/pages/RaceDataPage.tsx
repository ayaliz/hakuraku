import { useEffect, useRef, useState } from "react";
import { Alert, Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import RaceDataPresenter from "../components/RaceDataPresenter";
import { RaceSimulateData } from "../data/race_data_pb";
import { deserializeFromBase64 } from "../data/RaceDataParser";
import ShareLinkBox from "../components/ShareLinkBox";

const RaceDataPresenterAny = RaceDataPresenter as any;

type ShareCache = Record<string, string>;

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
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [parsedHorseInfo, setParsedHorseInfo] = useState<any[] | undefined>(undefined);
    const [parsedRaceData, setParsedRaceData] = useState<RaceSimulateData | undefined>(undefined);
    const [error, setError] = useState('');
    const [rawHorseInfo, setRawHorseInfo] = useState<any[] | undefined>(undefined);
    const [rawScenario, setRawScenario] = useState('');
    const [detectedCourseId, setDetectedCourseId] = useState<number | undefined>(undefined);
    const [shareStatus, setShareStatus] = useState<'' | 'sharing' | 'shared'>('');
    const [shareError, setShareError] = useState('');
    const [shareKey, setShareKey] = useState('');
    const [shareCache, setShareCache] = useState<ShareCache>({});
    const [horseActVersion, setHorseActVersion] = useState<string | undefined>(undefined);
    const [isShared, setIsShared] = useState(false);
    const [raceType, setRaceType] = useState<string | undefined>(undefined);
    const [dragOver, setDragOver] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        const kvKey = params.get('kv');
        if (kvKey) {
            fetch(`https://cors-proxy.ayaliz.workers.dev/share/${kvKey}`)
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
    }, []);

    function loadSharedData(data: { raceHorseInfo: string, raceScenario: string, detectedCourseId?: number, raceType?: string }) {
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
        } catch (err: any) {
            setError(`Failed to parse shared data: ${err.message}`);
        }
    }

    function finalizeParsing(horseInfo: any[], raceScenario: string, courseId?: number, actVersion?: string, type?: string) {
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
        setShareKey('');
        setHorseActVersion(actVersion);
        setIsShared(false);
        setRaceType(type);
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
        try {
            const courseSet = json['<RaceCourseSet>k__BackingField'];
            if (courseSet) courseId = courseSet['<Id>k__BackingField'] ?? courseSet.Id;
        } catch { }

        const type = json['<RaceType>k__BackingField'];

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

        finalizeParsing(horseInfo, raceScenario, courseId, horseActVer, type);
    }

    function parseNewFormat(json: any) {
        try {
            const rawHorses = json['race_horse_data_array'];
            const trainedCharas = json['trained_chara_array'] || [];
            const actVersion = json['horseACT_version'];
            const type = json['race_type'] || json['RaceType'];

            let courseId: number | undefined;
            const courseSet = json['race_course_set'] || json['RaceCourseSet'];
            if (courseSet) courseId = courseSet['id'] ?? courseSet.Id;

            const horseInfo = rawHorses.map((horseData: any, index: number) => {
                if (!horseData) return null;
                const trainedChara = trainedCharas[index];

                let deck: { position: number, id: number, lb: number, exp: number }[] = [];
                let parents: { positionId: number, cardId: number, rank: number, factors: { id: number, level: number }[] }[] = [];

                if (trainedChara) {
                    const supportCards = trainedChara['support_card_array'] || trainedChara['SupportCardArray'];
                    if (Array.isArray(supportCards)) {
                        deck = supportCards.map((card: any) => ({
                            position: card['position'] ?? card['Position'],
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

                return { ...horseData, deck, parents };
            }).filter((h: any) => h !== null);

            finalizeParsing(horseInfo, json['race_scenario'], courseId, actVersion, type);
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
                        if (!nameMap.has(copy.trainer_name)) nameMap.set(copy.trainer_name, `Anon${anonCounter++}`);
                        copy.trainer_name = nameMap.get(copy.trainer_name);
                    }
                    return copy;
                });
                content = JSON.stringify({
                    raceHorseInfo: JSON.stringify(anonHorseInfo),
                    raceScenario: rawScenario,
                    detectedCourseId,
                    raceType,
                    salt: Date.now()
                });
            } catch {
                alert('Failed to anonymize horse data.');
                return;
            }
        } else {
            content = JSON.stringify({ raceHorseInfo: JSON.stringify(rawHorseInfo), raceScenario: rawScenario, detectedCourseId, raceType });
        }

        const hash = await hashPayload(content);
        const cachedKey = shareCache[hash];
        if (cachedKey) { setShareStatus('shared'); setShareError(''); setShareKey(cachedKey); return; }

        setShareStatus('sharing');
        setShareError('');
        try {
            const res = await fetch('https://cors-proxy.ayaliz.workers.dev/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Share-Secret': import.meta.env.VITE_SHARE_SECRET ?? '' },
                body: content,
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const { key } = await res.json();
            setShareStatus('shared');
            setShareKey(key);
            setShareCache(prev => ({ ...prev, [hash]: key }));
        } catch (err: any) {
            setShareStatus('');
            setShareError(err.message);
        }
    };

    const shareUrl = `${window.location.origin}${window.location.pathname}#/racedata?kv=${shareKey}`;

    return <div style={{ paddingTop: 20 }}>
        <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleFileChange}
        />

        {!parsedRaceData ? (
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
                <Button variant="secondary" size="sm" onClick={() => share(true)} disabled={shareStatus === 'sharing'}>
                    Share (anon)
                </Button>
                {shareStatus === 'shared' && <ShareLinkBox shareUrl={shareUrl} />}
                {shareError && <span className="text-danger" style={{ fontSize: '0.85rem' }}>{shareError}</span>}
            </div>
        )}

        {error && <div className="text-danger" style={{ marginBottom: '12px' }}>{error}</div>}

        {parsedRaceData && parsedHorseInfo ? (
            <>
                {(!isShared && (!horseActVersion || horseActVersion !== '1.0.2')) && <Alert variant="info">
                    The version of horseACT used to generate this file appears to be outdated. A newer version is available at <a href="https://github.com/ayaliz/horseACT/releases/latest" target="_blank" rel="noreferrer">https://github.com/ayaliz/horseACT/releases/latest</a>. It's recommended to update by replacing your existing horseACT.dll.
                </Alert>}
                <RaceDataPresenterAny
                    raceHorseInfo={parsedHorseInfo}
                    raceData={parsedRaceData}
                    raceType={raceType}
                    detectedCourseId={detectedCourseId} />
            </>
        ) : (
            <Alert variant="info">
                Visit the <Link to="/setup">setup page</Link> if you don't know how to get your race data.
            </Alert>
        )}
    </div>;
}
