import React from "react";
import {Button, Col, Form} from "react-bootstrap";
import RaceDataPresenter from "../components/RaceDataPresenter";
import {RaceSimulateData} from "../data/race_data_pb";
import {deserializeFromBase64} from "../data/RaceDataParser";
import CopyButton from "../components/CopyButton";

type RaceDataPageState = {
    raceHorseInfoInput: string,
    raceScenarioInput: string,

    parsedHorseInfo: any,
    parsedRaceData: RaceSimulateData | undefined,

    shareStatus: '' | 'sharing' | 'shared',
    shareError: string,
    shareKey: string,
    anonymous: boolean,
};

export default class RaceDataPage extends React.Component<{}, RaceDataPageState> {
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
            anonymous: false,
        };
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

    share() {
        let {raceHorseInfoInput, raceScenarioInput, anonymous} = this.state;
        if (!raceScenarioInput) {
            alert('race_scenario is required.');
            return;
        }

        if (anonymous) {
            try {
                const horseInfo = JSON.parse(raceHorseInfoInput);
                const nameMap = new Map<string, string>();
                let anonCounter = 1;
                horseInfo.forEach((horse: any) => {
                    horse.viewer_id = 0;
                    if (horse.trainer_name) {
                        if (!nameMap.has(horse.trainer_name)) {
                            nameMap.set(horse.trainer_name, `Anon${anonCounter++}`);
                        }
                        horse.trainer_name = nameMap.get(horse.trainer_name);
                    }
                });
                raceHorseInfoInput = JSON.stringify(horseInfo);
            } catch (e) {
                alert('Failed to anonymize horse data. Is it valid JSON?');
                return;
            }
        }

        this.setState({shareStatus: 'sharing', shareError: ''});
        fetch('https://sourceb.in/api/bins', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                files: [{
                    content: JSON.stringify({
                        raceHorseInfo: raceHorseInfoInput,
                        raceScenario: raceScenarioInput
                    })
                }]
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.key) {
                    this.setState({shareStatus: 'shared', shareKey: data.key});
                } else {
                    throw new Error(data.message || 'Unknown error');
                }
            })
            .catch(err => {
                this.setState({shareStatus: '', shareError: err.message});
            });
    }

    render() {
        const {shareStatus, shareKey, shareError} = this.state;
        const shareUrl = `${window.location.origin}${window.location.pathname}#/racedata?bin=${shareKey}`;

        return <>
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

                <Button variant="secondary" onClick={() => this.share()} disabled={shareStatus === 'sharing'}>
                    {shareStatus === 'sharing' ? 'Sharing...' : 'Share'}
                </Button>
                {' '}
                <Button variant="secondary" onClick={() => this.setState({anonymous: true}, () => this.share())} disabled={shareStatus === 'sharing'}>
                    Share Anonymously
                </Button>
                {shareStatus === 'shared' && <CopyButton content={shareUrl}/>}
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