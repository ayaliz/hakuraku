import { JsonViewer } from "@textea/json-viewer";
import { computeOtherEvents } from "../RaceReplay/utils/analysisUtils";
import memoize from "memoize-one";
import React from "react";
import { Alert, Form } from "react-bootstrap";
import {
    RaceSimulateData,
} from "../../data/race_data_pb";
import {
    filterCharaSkills,
} from "../../data/RaceDataUtils";

import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import CharaList from "./components/CharaList";
import RaceGraph from "./components/RaceGraph";
import {
    calculateRaceDistance,
    otherRaceEventLabels,
    unknownCharaTag,
} from "./utils/RacePresenterUtils";

import RaceReplay from "../RaceReplay/index";

const JsonViewerAny = JsonViewer as any;

const supportedRaceDataVersion = 100000002;

type RaceDataPresenterProps = {
    raceHorseInfo: any[],
    raceData: RaceSimulateData,
    detectedCourseId?: number,
    raceType?: string,
};

type RaceDataPresenterState = {
    selectedCharaFrameOrder: number | undefined,
    activeCourseId: number | undefined,

    showSkills: boolean,
    showTargetedSkills: boolean,
    showBlocks: boolean,
    showTemptationMode: boolean,
    showOtherRaceEvents: boolean,
};

class RaceDataPresenter extends React.PureComponent<RaceDataPresenterProps, RaceDataPresenterState> {
    constructor(props: RaceDataPresenterProps) {
        super(props);

        this.state = {
            selectedCharaFrameOrder: undefined,
            activeCourseId: props.detectedCourseId,

            showSkills: true,
            showTargetedSkills: true,
            showBlocks: true,
            showTemptationMode: true,
            showOtherRaceEvents: true,
        };
    }


    handleTrackChange = (courseId: number | undefined) => {
        this.setState({ activeCourseId: courseId });
    };

    displayNames = memoize((raceHorseInfo: any[], raceData: RaceSimulateData) => {
        const nameFromRaceHorseInfo: Record<number, string> = {};
        if (raceHorseInfo && raceHorseInfo.length === raceData.horseResult.length) {
            raceHorseInfo.forEach((d: any) => {
                const frameOrder = d['frame_order'] - 1; // 0-indexed
                const charaId = d['chara_id'];
                const charaDisplayName = charaId in UMDatabaseWrapper.charas ? UMDatabaseWrapper.charas[charaId].name : unknownCharaTag;
                const trainerNameSuffix = d['trainer_name'] ? ` [${d['trainer_name']}]` : '';
                nameFromRaceHorseInfo[frameOrder] = ` ${charaDisplayName}${trainerNameSuffix}`;
            });
        }

        const m: Record<number, string> = {};
        for (let frameOrder = 0; frameOrder < raceData.horseResult.length; frameOrder++) {
            // frameOrder is 0 ordered.
            const finishOrder = raceData.horseResult[frameOrder].finishOrder! + 1; // 1-indexed
            m[frameOrder] = `#${finishOrder}${nameFromRaceHorseInfo[frameOrder] ?? ''}`;
        }
        return m;
    });

    skillActivations = memoize((raceData: RaceSimulateData) => {
        const allSkillActivations: Record<number, { time: number; name: string; param: number[] }[]> = {};
        for (let i = 0; i < raceData.horseResult.length; i++) {
            const frameOrder = i;
            const skills = filterCharaSkills(raceData, frameOrder).map(event => ({
                time: event.frameTime!,
                name: UMDatabaseWrapper.skillName(event.param[1]),
                param: event.param,
            }));
            allSkillActivations[frameOrder] = skills;
        }
        return allSkillActivations;
    });

    otherEvents = memoize((raceData: RaceSimulateData, raceHorseInfo: any[], detectedCourseId: number | undefined, skillActivations: Record<number, { time: number; name: string; param: number[] }[]>) => {
        const goalInX = calculateRaceDistance(raceData);
        return computeOtherEvents(raceData, raceHorseInfo, detectedCourseId, skillActivations, goalInX);
    });


    render() {
        const sectionDividerStyle = {
            height: '1px',
            background: 'linear-gradient(90deg, transparent 0%, rgba(165, 201, 184, 0.4) 20%, rgba(165, 201, 184, 0.4) 80%, transparent 100%)',
            margin: '20px 0',
            border: 'none',
        };

        return <div>
            {(this.props.raceData.header!.version! > supportedRaceDataVersion) &&
                <Alert variant="warning">
                    RaceData version {this.props.raceData.header!.version!} higher than supported
                    version {supportedRaceDataVersion}, use at your own risk!
                </Alert>}
            <CharaList
                raceHorseInfo={this.props.raceHorseInfo}
                raceData={this.props.raceData}
                detectedCourseId={this.state.activeCourseId}
                skillActivations={this.skillActivations(this.props.raceData)}
                otherEvents={this.otherEvents(this.props.raceData, this.props.raceHorseInfo, this.state.activeCourseId, this.skillActivations(this.props.raceData))}
                raceType={this.props.raceType}
            />

            <div style={sectionDividerStyle} />

            <div className="replay-section">
                <RaceReplay
                    raceData={this.props.raceData}
                    raceHorseInfo={this.props.raceHorseInfo}
                    displayNames={this.displayNames(this.props.raceHorseInfo, this.props.raceData)}
                    skillActivations={this.skillActivations(this.props.raceData)}
                    otherEvents={this.otherEvents(this.props.raceData, this.props.raceHorseInfo, this.state.activeCourseId, this.skillActivations(this.props.raceData))}
                    detectedCourseId={this.props.detectedCourseId}
                    onTrackChange={this.handleTrackChange}
                />
            </div>

            <div style={sectionDividerStyle} />

            <div className="chara-analysis-section">
                <Form>
                    <Form.Group>
                        <Form.Control as="select" custom
                            onChange={(e) => this.setState({ selectedCharaFrameOrder: e.target.value ? parseInt(e.target.value) : undefined })}>
                            <option value="">Select Character</option>
                            {Object.entries(this.displayNames(this.props.raceHorseInfo, this.props.raceData))
                                .sort(([, a], [, b]) => a.localeCompare(b))
                                .map(([frameOrder, displayName]) => {
                                    return <option key={frameOrder} value={frameOrder}>{displayName}</option>;
                                })}
                        </Form.Control>
                        <Form.Switch
                            checked={this.state.showSkills}
                            onChange={(e) => this.setState({ showSkills: e.target.checked })}
                            id="show-skills"
                            label="Show Skills" />
                        <Form.Switch
                            checked={this.state.showTargetedSkills}
                            onChange={(e) => this.setState({ showTargetedSkills: e.target.checked })}
                            id="show-targeted-skills"
                            label="Show Targeted Skills" />
                        <Form.Switch
                            checked={this.state.showBlocks}
                            onChange={(e) => this.setState({ showBlocks: e.target.checked })}
                            id="show-blocks"
                            label="Show Blocks" />
                        <Form.Switch
                            checked={this.state.showTemptationMode}
                            onChange={(e) => this.setState({ showTemptationMode: e.target.checked })}
                            id="show-temptation-mode"
                            label="Show Temptation Mode" />
                        <Form.Switch
                            checked={this.state.showOtherRaceEvents}
                            onChange={(e) => this.setState({ showOtherRaceEvents: e.target.checked })}
                            id="show-competes"
                            label={`Show Other Race Events (${Array.from(otherRaceEventLabels.values()).join(', ')})`} />
                    </Form.Group>
                </Form>
                {this.state.selectedCharaFrameOrder !== undefined &&
                    <RaceGraph
                        raceData={this.props.raceData}
                        frameOrder={this.state.selectedCharaFrameOrder}
                        displayNames={this.displayNames(this.props.raceHorseInfo, this.props.raceData)}
                        showSkills={this.state.showSkills}
                        showTargetedSkills={this.state.showTargetedSkills}
                        showBlocks={this.state.showBlocks}
                        showTemptationMode={this.state.showTemptationMode}
                        showOtherRaceEvents={this.state.showOtherRaceEvents}
                    />
                }
            </div>

            <div style={sectionDividerStyle} />

            <JsonViewerAny value={this.props.raceData.toJson()} defaultInspectDepth={1} theme="dark" />
        </div>;
    }
}

export default RaceDataPresenter;