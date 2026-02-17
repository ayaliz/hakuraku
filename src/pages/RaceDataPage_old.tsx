import React from "react";
import { Button, Col, Form, Row } from "react-bootstrap";
import RaceDataPresenter from "../components/RaceDataPresenter_old";
import { RaceSimulateData } from "../data/race_data_pb";
import { deserializeFromBase64 } from "../data/RaceDataParser";
import ShareLinkBox from "../components/ShareLinkBox";

const RaceDataPresenterAny = RaceDataPresenter as any;

type ShareCache = Record<string, string>;

type RaceDataPageState = {
    raceHorseInfoInput: string,
    raceScenarioInput: string,

    parsedHorseInfo: any,
    parsedRaceData: RaceSimulateData | undefined,

    shareStatus: '' | 'sharing' | 'shared',
    shareError: string,
    shareKey: string,

    shareCache: ShareCache,
};

export default class RaceDataPageOld extends React.Component<{}, RaceDataPageState> {
    private fileInputRef: React.RefObject<HTMLInputElement>;

    constructor(props: {}) {
        super(props);

        this.state = {
            raceHorseInfoInput: '',
            raceScenarioInput: '',

            parsedHorseInfo: undefined,
            parsedRaceData: undefined,

            shareStatus: '',
            shareError: '',
            shareKey: '',

            shareCache: {},
        };

        this.fileInputRef = React.createRef();
    }

    componentDidMount() {
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        const binKey = params.get('bin');
        const catboxKey = params.get('catbox');

        if (catboxKey) {
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
                    this.setState({
                        raceHorseInfoInput: data.raceHorseInfo,
                        raceScenarioInput: data.raceScenario,
                    }, () => this.parse());
                })
                .catch(err => {
                    console.error(err);
                    let msg = err.message;
                    if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
                        msg += ' (Possible CORS issue or Proxy block)';
                    }
                    alert(`Failed to load from catbox: ${msg}`);
                });
        } else if (binKey) {
            const target = `https://cdn.sourceb.in/bins/${binKey}/0`;
            fetch(target)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then(data => {
                    this.setState({
                        raceHorseInfoInput: data.raceHorseInfo,
                        raceScenarioInput: data.raceScenario,
                    }, () => this.parse());
                })
                .catch(err => {
                    console.error(err);
                    alert(`Failed to load from bin: ${err.message}`);
                });
        }
    }

    parse() {
        if (!this.state.raceScenarioInput.trim()) return;
        this.setState({ parsedRaceData: deserializeFromBase64(this.state.raceScenarioInput.trim()) });
        try {
            this.setState({ parsedHorseInfo: JSON.parse(this.state.raceHorseInfoInput) });
        } catch (e) {
            this.setState({ parsedHorseInfo: undefined });
        }
    }

    private tryCanonicalizeJson = (text: string): string => {
        try {
            return JSON.stringify(JSON.parse(text));
        } catch {
            return text.trim();
        }
    };

    private buildContentNonAnon = (horseInfoRaw: string, scenarioRaw: string): string => {
        const raceHorseInfo = this.tryCanonicalizeJson(horseInfoRaw);
        const raceScenario = scenarioRaw.trim();
        return JSON.stringify({ raceHorseInfo, raceScenario });
    };

    private buildContentAnon = (horseInfoRaw: string, scenarioRaw: string): string | null => {
        try {
            const parsed = JSON.parse(horseInfoRaw);
            const nameMap = new Map<string, string>();
            let anonCounter = 1;

            const list = Array.isArray(parsed) ? parsed : [parsed];
            list.forEach((horse: any) => {
                if (horse && typeof horse === 'object') {
                    horse.viewer_id = 0;
                    if (horse.trainer_name) {
                        if (!nameMap.has(horse.trainer_name)) {
                            nameMap.set(horse.trainer_name, `Anon${anonCounter++}`);
                        }
                        horse.trainer_name = nameMap.get(horse.trainer_name);
                    }
                }
            });

            const anonHorseInfo = Array.isArray(parsed) ? list : list[0];
            const raceHorseInfo = JSON.stringify(anonHorseInfo);
            const raceScenario = scenarioRaw.trim();
            return JSON.stringify({
                raceHorseInfo,
                raceScenario,
                salt: Date.now()
            });
        } catch {
            return null;
        }
    };

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

    handleUploadClick = () => {
        this.fileInputRef.current?.click();
    };

    handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!/\.txt$/i.test(file.name)) {
            alert('Please choose a .txt file.');
            e.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => {
            alert('Failed to read the file.');
            e.target.value = '';
        };
        reader.onload = () => {
            const text = String(reader.result ?? '');
            const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            const firstLine = (lines[0] || '').replace(/^\uFEFF/, '');
            const secondLine = lines[1] || '';

            this.setState(
                {
                    raceHorseInfoInput: firstLine,
                    raceScenarioInput: secondLine
                },
                () => this.parse()
            );

            e.target.value = '';
        };

        reader.readAsText(file);
    };

    share = async (anonymous: boolean) => {
        let { raceHorseInfoInput, raceScenarioInput, shareCache } = this.state;

        if (!raceScenarioInput.trim()) {
            alert('race_scenario is required.');
            return;
        }

        let content: string | null;
        if (anonymous) {
            content = this.buildContentAnon(raceHorseInfoInput, raceScenarioInput);
            if (content === null) {
                alert('Failed to anonymize horse data. Is it valid JSON?');
                return;
            }
        } else {
            content = this.buildContentNonAnon(raceHorseInfoInput, raceScenarioInput);
        }

        const hash = await this.hashPayload(content);

        const cachedKey = shareCache[hash];
        if (cachedKey) {
            this.setState({ shareStatus: 'shared', shareError: '', shareKey: cachedKey });
            return;
        }

        this.setState({ shareStatus: 'sharing', shareError: '' });

        const blob = new Blob([content], { type: 'application/json' });
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        formData.append('fileToUpload', blob, 'race.json');

        try {
            const workerUrl = 'https://cors-proxy.ayaliz.workers.dev';

            const res = await fetch(`${workerUrl}/?https://catbox.moe/user/api.php`, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const text = await res.text();
            if (text.startsWith('http')) {
                const parts = text.split('/');
                const filename = parts[parts.length - 1];
                const nextCache: ShareCache = { ...this.state.shareCache, [hash]: filename };
                this.setState({ shareStatus: 'shared', shareKey: filename, shareCache: nextCache });
            } else {
                throw new Error('Upload failed: ' + text);
            }
        } catch (err: any) {
            this.setState({ shareStatus: '', shareError: err.message });
        }
    };

    render() {
        const { shareStatus, shareKey, shareError } = this.state;
        const shareUrl = `${window.location.origin}${window.location.pathname}#/racedata_old?catbox=${shareKey}`;

        return <>
            <input
                ref={this.fileInputRef}
                type="file"
                accept=".txt,text/plain"
                style={{ display: 'none' }}
                onChange={this.handleFileChange}
            />

            <Form>
                <Row>
                    <Form.Group as={Col}>
                        <Form.Label>
                            [Optional] <code>race_start_info.race_horse_data</code> (for single
                            mode), <code>race_horse_data_array</code> (for daily race / legend race, not in the same
                            packet), or <code>race_start_params_array.race_horse_data_array</code> (for team race)
                        </Form.Label>
                        <Form.Control as="textarea" rows={3}
                            value={this.state.raceHorseInfoInput}
                            onChange={e => this.setState({ raceHorseInfoInput: e.target.value })} />
                    </Form.Group>
                </Row>
                <Row>
                    <Form.Group as={Col}>
                        <Form.Label>[Required] <code>race_scenario</code></Form.Label>
                        <Form.Control as="textarea" rows={3}
                            value={this.state.raceScenarioInput}
                            onChange={e => this.setState({ raceScenarioInput: e.target.value })} />
                    </Form.Group>
                </Row>

                <Button variant="primary" onClick={() => this.parse()}>
                    Parse
                </Button>
                {' '}
                <Button variant="info" onClick={this.handleUploadClick}>
                    Upload race
                </Button>
                {' '}

                <Button variant="secondary" onClick={() => this.share(false)} disabled={shareStatus === 'sharing'}>
                    {shareStatus === 'sharing' ? 'Sharing...' : 'Share'}
                </Button>
                {' '}
                <Button variant="secondary" onClick={() => this.share(true)} disabled={shareStatus === 'sharing'}>
                    Share Anonymously
                </Button>
                {shareStatus === 'shared' && <ShareLinkBox shareUrl={shareUrl} />}
                {shareError && <span className="ms-2 text-danger">{shareError}</span>}
            </Form>

            <hr />

            {this.state.parsedRaceData &&
                <RaceDataPresenterAny
                    raceHorseInfo={this.state.parsedHorseInfo}
                    raceData={this.state.parsedRaceData} />}
        </>;
    }
}
