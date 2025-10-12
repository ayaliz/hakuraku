import React from "react";
import {Button, Col, Form} from "react-bootstrap";
import RaceDataPresenter from "../components/RaceDataPresenter";
import {RaceSimulateData} from "../data/race_data_pb";
import {deserializeFromBase64} from "../data/RaceDataParser";
import ShareLinkBox from "../components/ShareLinkBox";

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

export default class RaceDataPage extends React.Component<{}, RaceDataPageState> {
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

    parse() {
        this.setState({parsedRaceData: deserializeFromBase64(this.state.raceScenarioInput.trim())});
        try {
            this.setState({parsedHorseInfo: JSON.parse(this.state.raceHorseInfoInput)});
        } catch (e) {
            this.setState({parsedHorseInfo: undefined});
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
            return JSON.stringify({ raceHorseInfo, raceScenario });
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
        fetch('https://sourceb.in/api/bins', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
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
        const {shareStatus, shareKey, shareError} = this.state;
        const shareUrl = `${window.location.origin}${window.location.pathname}#/racedata?bin=${shareKey}`;

        return <>
            <input
                ref={this.fileInputRef}
                type="file"
                accept=".txt,text/plain"
                style={{display: 'none'}}
                onChange={this.handleFileChange}
            />

            <Form>
                <Form.Row>
                    <Form.Group as={Col}>
                        <Form.Label>
                            [Optional] <code>race_start_info.race_horse_data</code> (for single
                            mode), <code>race_horse_data_array</code> (for daily race / legend race, not in the same
                            packet), or <code>race_start_params_array.race_horse_data_array</code> (for team race)
                        </Form.Label>
                        <Form.Control as="textarea" rows={3}
                                      value={this.state.raceHorseInfoInput}
                                      onChange={e => this.setState({raceHorseInfoInput: e.target.value})}/>
                    </Form.Group>
                </Form.Row>
                <Form.Row>
                    <Form.Group as={Col}>
                        <Form.Label>[Required] <code>race_scenario</code></Form.Label>
                        <Form.Control as="textarea" rows={3}
                                      value={this.state.raceScenarioInput}
                                      onChange={e => this.setState({raceScenarioInput: e.target.value})}/>
                    </Form.Group>
                </Form.Row>

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
                {shareStatus === 'shared' && <ShareLinkBox shareUrl={shareUrl}/>}
                {shareError && <span className="ml-2 text-danger">{shareError}</span>}
            </Form>

            <hr/>

            {this.state.parsedRaceData &&
                <RaceDataPresenter
                    raceHorseInfo={this.state.parsedHorseInfo}
                    raceData={this.state.parsedRaceData}/>}
        </>;
    }
}
