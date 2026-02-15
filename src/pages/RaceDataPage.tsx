import React from "react";
import { Alert, Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import RaceDataPresenter from "../components/RaceDataPresenter";
import { RaceSimulateData } from "../data/race_data_pb";
import { deserializeFromBase64 } from "../data/RaceDataParser";
import ShareLinkBox from "../components/ShareLinkBox";

const RaceDataPresenterAny = RaceDataPresenter as any;

type ShareCache = Record<string, string>;

type RaceDataPageState = {
    parsedHorseInfo: any[] | undefined,
    parsedRaceData: RaceSimulateData | undefined,
    error: string,

    rawHorseInfo: any[] | undefined,
    rawScenario: string,
    detectedCourseId: number | undefined,
    shareStatus: '' | 'sharing' | 'shared',
    shareError: string,
    shareKey: string,
    shareCache: ShareCache,
    horseActVersion: string | undefined,
    isShared: boolean,
    raceType: string | undefined,
};

export default class RaceDataPage extends React.Component<{}, RaceDataPageState> {
    private fileInputRef: React.RefObject<HTMLInputElement>;

    constructor(props: {}) {
        super(props);

        this.state = {
            parsedHorseInfo: undefined,
            parsedRaceData: undefined,
            error: '',

            rawHorseInfo: undefined,
            rawScenario: '',
            detectedCourseId: undefined,
            shareStatus: '',
            shareError: '',
            shareKey: '',
            shareCache: {},
            horseActVersion: undefined,
            isShared: false,
            raceType: undefined,
        };

        this.fileInputRef = React.createRef();
    }

    componentDidMount() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        const binKey = params.get('bin');
        const catboxKey = params.get('catbox');

        const kvKey = params.get('kv');

        if (kvKey) {
            fetch(`https://savedraces.ayaliz.workers.dev/share/${kvKey}`)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    this.loadSharedData(data);
                })
                .catch(err => {
                    console.error(err);
                    this.setState({ error: `Failed to load shared data: ${err.message}` });
                });
        } else if (catboxKey) {
            const workerUrl = 'https://cors-proxy.ayaliz.workers.dev';
            const targetUrl = `https://files.catbox.moe/${catboxKey}`;
            const target = `${workerUrl}/?${targetUrl}`;
            fetch(target)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.text();
                })
                .then(text => {
                    if (!text || text.trim().length === 0) {
                        throw new Error('File not found (404) or empty response from server.');
                    }
                    return JSON.parse(text);
                })
                .then(data => {
                    this.loadSharedData(data);
                })
                .catch(err => {
                    console.error(err);
                    let msg = err.message;
                    if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
                        msg += ' (Possible CORS issue or Proxy block)';
                    }
                    this.setState({ error: `Failed to load from catbox: ${msg}` });
                });
        } else if (binKey) {
            const target = `https://cdn.sourceb.in/bins/${binKey}/0`;
            fetch(target)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    this.loadSharedData(data);
                })
                .catch(err => {
                    console.error(err);
                    this.setState({ error: `Failed to load from bin: ${err.message}` });
                });
        }
    }

    loadSharedData(data: { raceHorseInfo: string, raceScenario: string, detectedCourseId?: number, raceType?: string }) {
        try {
            const horseInfo = typeof data.raceHorseInfo === 'string' ? JSON.parse(data.raceHorseInfo) : data.raceHorseInfo;
            const parsedRaceData = deserializeFromBase64(data.raceScenario);

            if (!parsedRaceData) {
                this.setState({ error: 'Failed to parse race scenario data from shared link' });
                return;
            }

            const horseInfoArray = Array.isArray(horseInfo) ? horseInfo : [horseInfo];

            this.setState({
                parsedHorseInfo: horseInfoArray,
                parsedRaceData: parsedRaceData,
                rawHorseInfo: horseInfoArray,
                rawScenario: data.raceScenario,
                detectedCourseId: data.detectedCourseId,
                error: '',
                isShared: true,
                raceType: data.raceType,
            });
        } catch (err: any) {
            this.setState({ error: `Failed to parse shared data: ${err.message}` });
        }
    }

    handleUploadClick = () => {
        this.fileInputRef.current?.click();
    };

    handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!/\.json$/i.test(file.name)) {
            alert('Please choose a .json file.');
            e.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => {
            alert('Failed to read the file.');
            e.target.value = '';
        };
        reader.onload = () => {
            try {
                const text = String(reader.result ?? '');
                const json = JSON.parse(text);
                this.parseRaceJson(json);
            } catch (err: any) {
                this.setState({ error: `Failed to parse JSON: ${err.message}` });
            }
            e.target.value = '';
        };

        reader.readAsText(file);
    };

    parseRaceJson(json: any) {
        // CHECK FOR NEW FORMAT
        if (json['race_scenario'] && Array.isArray(json['race_horse_data_array'])) {
            this.parseNewFormat(json);
            return;
        }

        const horseActVersion = json['horseACT_version'];

        // --- OLD FORMAT LOGIC BELOW ---
        const raceHorseArray = json['<RaceHorse>k__BackingField'];
        if (!Array.isArray(raceHorseArray)) {
            this.setState({ error: 'Could not find <RaceHorse>k__BackingField or race_horse_data_array in JSON' });
            return;
        }

        let detectedCourseId: number | undefined = undefined;
        try {
            const courseSet = json['<RaceCourseSet>k__BackingField'];
            if (courseSet) {
                detectedCourseId = courseSet['<Id>k__BackingField'] ?? courseSet.Id;
            }
        } catch { }


        const raceType = json['<RaceType>k__BackingField'];

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
                                        return {
                                            id: fId,
                                            level: fId % 100
                                        };
                                    })
                                    : []
                            }));
                    }
                }

                return {
                    ...horseData,
                    deck: deck,
                    parents: parents
                };
            })
            .filter((data: any) => data !== null);

        if (horseInfo.length === 0) {
            this.setState({ error: 'No horse data found in _responseHorseData fields' });
            return;
        }

        const raceScenario = json['<SimDataBase64>k__BackingField'];
        if (typeof raceScenario !== 'string' || !raceScenario) {
            this.setState({ error: 'Could not find <SimDataBase64>k__BackingField in JSON' });
            return;
        }

        this.finalizeParsing(horseInfo, raceScenario, detectedCourseId, horseActVersion, raceType);
    }

    parseNewFormat(json: any) {
        try {
            const rawHorses = json['race_horse_data_array'];
            const trainedCharas = json['trained_chara_array'] || [];
            const horseActVersion = json['horseACT_version'];
            const raceType = json['race_type'] || json['RaceType'];

            let detectedCourseId: number | undefined = undefined;
            const courseSet = json['race_course_set'] || json['RaceCourseSet'];
            if (courseSet) {
                detectedCourseId = courseSet['id'] ?? courseSet.Id;
            }

            const horseInfo = rawHorses.map((horseData: any, index: number) => {
                if (!horseData) return null;

                // Attempt to find matching trained chara (assuming 1:1 index alignment)
                const trainedChara = trainedCharas[index];

                let deck: { position: number, id: number, lb: number, exp: number }[] = [];
                let parents: { positionId: number, cardId: number, rank: number, factors: { id: number, level: number }[] }[] = [];

                if (trainedChara) {
                    // Map Deck (Support Cards)
                    // Checks for both snake_case (typical in cleaned json) and PascalCase just in case
                    const supportCards = trainedChara['support_card_array'] || trainedChara['SupportCardArray'];
                    if (Array.isArray(supportCards)) {
                        deck = supportCards.map((card: any) => ({
                            position: card['position'] ?? card['Position'],
                            id: card['support_card_id'] ?? card['SupportCardId'],
                            lb: card['limit_break_count'] ?? card['LimitBreakCount'],
                            exp: card['exp'] ?? card['Exp']
                        })).sort((a: any, b: any) => a.position - b.position);
                    }

                    // Map Parents (Succession)
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
                                            return {
                                                id: fId,
                                                level: fId % 100
                                            };
                                        })
                                        : []
                                };
                            });
                    }
                }

                return {
                    ...horseData,
                    deck,
                    parents
                };
            }).filter((h: any) => h !== null);

            this.finalizeParsing(horseInfo, json['race_scenario'], detectedCourseId, horseActVersion, raceType);

        } catch (err: any) {
            this.setState({ error: `Failed to parse new JSON format: ${err.message}` });
        }
    }

    finalizeParsing(horseInfo: any[], raceScenario: string, detectedCourseId?: number, horseActVersion?: string, raceType?: string) {
        const parsedRaceData = deserializeFromBase64(raceScenario);
        if (!parsedRaceData) {
            this.setState({ error: 'Failed to parse race scenario data' });
            return;
        }

        this.setState({
            parsedHorseInfo: horseInfo,
            parsedRaceData: parsedRaceData,
            rawHorseInfo: horseInfo,
            rawScenario: raceScenario,
            detectedCourseId: detectedCourseId,
            error: '',
            shareStatus: '',
            shareError: '',
            shareKey: '',
            horseActVersion: horseActVersion,
            isShared: false,
            raceType: raceType,
        });
    }

    private bufferToHex = (buf: ArrayBuffer): string =>
        Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

    private hashPayload = async (payload: string): Promise<string> => {
        try {
            const enc = new TextEncoder();
            const digest = await crypto.subtle.digest('SHA-256', enc.encode(payload));
            return this.bufferToHex(digest);
        } catch {
            let h = 2166136261;
            for (let i = 0; i < payload.length; i++) {
                h ^= payload.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
            return (h >>> 0).toString(16);
        }
    };

    private buildContentNonAnon = (): string => {
        const { rawHorseInfo, rawScenario, detectedCourseId, raceType } = this.state;
        const raceHorseInfo = JSON.stringify(rawHorseInfo);
        return JSON.stringify({ raceHorseInfo, raceScenario: rawScenario, detectedCourseId, raceType });
    };

    private buildContentAnon = (): string | null => {
        const { rawHorseInfo, rawScenario, detectedCourseId } = this.state;
        if (!rawHorseInfo) return null;

        try {
            const nameMap = new Map<string, string>();
            let anonCounter = 1;

            const anonHorseInfo = rawHorseInfo.map((horse: any) => {
                const copy = { ...horse };
                copy.viewer_id = 0;
                if (copy.trainer_name) {
                    if (!nameMap.has(copy.trainer_name)) {
                        nameMap.set(copy.trainer_name, `Anon${anonCounter++}`);
                    }
                    copy.trainer_name = nameMap.get(copy.trainer_name);
                }
                return copy;
            });

            const raceHorseInfo = JSON.stringify(anonHorseInfo);
            return JSON.stringify({
                raceHorseInfo,
                raceScenario: rawScenario,
                detectedCourseId,
                raceType: this.state.raceType,
                salt: Date.now() // Force unique content to prevent Catbox/cache collisions on stale files
            });
        } catch {
            return null;
        }
    };

    share = async (anonymous: boolean) => {
        const { rawScenario, shareCache } = this.state;

        if (!rawScenario) {
            alert('No race data loaded.');
            return;
        }

        let content: string | null;
        if (anonymous) {
            content = this.buildContentAnon();
            if (content === null) {
                alert('Failed to anonymize horse data.');
                return;
            }
        } else {
            content = this.buildContentNonAnon();
        }

        const hash = await this.hashPayload(content);

        const cachedKey = shareCache[hash];
        if (cachedKey) {
            this.setState({ shareStatus: 'shared', shareError: '', shareKey: cachedKey });
            return;
        }

        this.setState({ shareStatus: 'sharing', shareError: '' });

        try {
            const res = await fetch('https://savedraces.ayaliz.workers.dev/share', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Share-Secret': process.env.REACT_APP_SHARE_SECRET ?? '',
                },
                body: content,
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const { key } = await res.json();
            const nextCache: ShareCache = { ...this.state.shareCache, [hash]: key };
            this.setState({ shareStatus: 'shared', shareKey: key, shareCache: nextCache });

        } catch (err: any) {
            this.setState({ shareStatus: '', shareError: err.message });
        }
    };

    render() {
        const { error, shareStatus, shareKey, shareError, parsedRaceData } = this.state;
        const shareUrl = `${window.location.origin}${window.location.pathname}#/racedata?kv=${shareKey}`;

        return <>
            <input
                ref={this.fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={this.handleFileChange}
            />

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                <Button variant="info" size="sm" onClick={this.handleUploadClick}>
                    Upload race
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => this.share(false)}
                    disabled={shareStatus === 'sharing' || !parsedRaceData}
                >
                    {shareStatus === 'sharing' ? 'Sharing...' : 'Share'}
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => this.share(true)}
                    disabled={shareStatus === 'sharing' || !parsedRaceData}
                >
                    Share Anonymously
                </Button>
                {shareStatus === 'shared' && <ShareLinkBox shareUrl={shareUrl} />}
                {shareError && <span className="text-danger" style={{ fontSize: '0.85rem' }}>{shareError}</span>}
            </div>

            {error && <div className="text-danger" style={{ marginBottom: '12px' }}>{error}</div>}

            {this.state.parsedRaceData && this.state.parsedHorseInfo ? (
                <>
                    {(!this.state.isShared && (!this.state.horseActVersion || this.state.horseActVersion !== '1.0.2')) && <Alert variant="info">
                        The version of horseACT used to generate this file appears to be outdated. A newer version is available at <a href="https://github.com/ayaliz/horseACT/releases/latest" target="_blank" rel="noreferrer">https://github.com/ayaliz/horseACT/releases/latest</a>. It's recommended to update by replacing your existing horseACT.dll.
                    </Alert>}
                    <RaceDataPresenterAny
                        raceHorseInfo={this.state.parsedHorseInfo}
                        raceData={this.state.parsedRaceData}
                        raceType={this.state.raceType}
                        detectedCourseId={this.state.detectedCourseId} />
                </>
            ) : (
                <Alert variant="info">
                    <p>
                        If you're on the original version of horseACT, visit the{' '}
                        <Link to="/setup">setup page</Link> to update to the latest version.
                    </p>
                    <p className="mb-0">
                        Looking to analyze older saved races? Use the{' '}
                        <Link to="/racedata_old">legacy race parser</Link>.
                    </p>
                </Alert>
            )}
        </>;
    }
}