import React from "react";
import { Alert, Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import RaceDataPresenter from "../components/RaceDataPresenter";
import { RaceSimulateData } from "../data/race_data_pb";
import { deserializeFromBase64 } from "../data/RaceDataParser";
import ShareLinkBox from "../components/ShareLinkBox";

type ShareCache = Record<string, string>;

type RaceDataPageState = {
    parsedHorseInfo: any[] | undefined,
    parsedRaceData: RaceSimulateData | undefined,
    error: string,

    rawHorseInfo: any[] | undefined,
    rawScenario: string,
    shareStatus: '' | 'sharing' | 'shared',
    shareError: string,
    shareKey: string,
    shareCache: ShareCache,
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
            shareStatus: '',
            shareError: '',
            shareKey: '',
            shareCache: {},
        };

        this.fileInputRef = React.createRef();
    }

    componentDidMount() {
        const key = new URLSearchParams(window.location.hash.split('?')[1]).get('bin');
        if (!key) return;

        const target = `https://cdn.sourceb.in/bins/${key}/0`;
        const proxied = `https://corsproxy.io/?${encodeURIComponent(target)}`;
        fetch(proxied)
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

    loadSharedData(data: { raceHorseInfo: string, raceScenario: string }) {
        try {
            const horseInfo = JSON.parse(data.raceHorseInfo);
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
                error: '',
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
        const raceHorseArray = json['<RaceHorse>k__BackingField'];
        if (!Array.isArray(raceHorseArray)) {
            this.setState({ error: 'Could not find <RaceHorse>k__BackingField in JSON' });
            return;
        }

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
            error: '',
            shareStatus: '',
            shareError: '',
            shareKey: '',
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
        const { rawHorseInfo, rawScenario } = this.state;
        const raceHorseInfo = JSON.stringify(rawHorseInfo);
        return JSON.stringify({ raceHorseInfo, raceScenario: rawScenario });
    };

    private buildContentAnon = (): string | null => {
        const { rawHorseInfo, rawScenario } = this.state;
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
            return JSON.stringify({ raceHorseInfo, raceScenario: rawScenario });
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
        fetch('https://sourceb.in/api/bins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                files: [{ content }]
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.key) {
                    const nextCache: ShareCache = { ...this.state.shareCache, [hash]: data.key };
                    this.setState({ shareStatus: 'shared', shareKey: data.key, shareCache: nextCache });
                } else {
                    throw new Error(data.message || 'Unknown error');
                }
            })
            .catch(err => {
                this.setState({ shareStatus: '', shareError: err.message });
            });
    };

    render() {
        const { error, shareStatus, shareKey, shareError, parsedRaceData } = this.state;
        const shareUrl = `${window.location.origin}${window.location.pathname}#/racedata?bin=${shareKey}`;

        return <>
            <input
                ref={this.fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={this.handleFileChange}
            />

            <Button variant="info" onClick={this.handleUploadClick}>
                Upload race
            </Button>
            {' '}
            <Button variant="secondary" onClick={() => this.share(false)} disabled={shareStatus === 'sharing' || !parsedRaceData}>
                {shareStatus === 'sharing' ? 'Sharing...' : 'Share'}
            </Button>
            {' '}
            <Button variant="secondary" onClick={() => this.share(true)} disabled={shareStatus === 'sharing' || !parsedRaceData}>
                Share Anonymously
            </Button>
            {shareStatus === 'shared' && <ShareLinkBox shareUrl={shareUrl} />}
            {shareError && <span className="ml-2 text-danger">{shareError}</span>}

            {error && <div className="mt-2 text-danger">{error}</div>}

            <hr />

            {this.state.parsedRaceData && this.state.parsedHorseInfo ? (
                <RaceDataPresenter
                    raceHorseInfo={this.state.parsedHorseInfo}
                    raceData={this.state.parsedRaceData} />
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