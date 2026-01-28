import { JsonViewer } from "@textea/json-viewer";
import memoize from "memoize-one";
import React from "react";
import { Alert, Form } from "react-bootstrap";
import {
    RaceSimulateData,
    RaceSimulateEventData_SimulateEventType,
} from "../../data/race_data_pb";
import {
    filterCharaSkills,
} from "../../data/RaceDataUtils";
import { fromRaceHorseData, TrainedCharaData } from "../../data/TrainedCharaData";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import CharaList from "./components/CharaList";
import FoldCard from "../FoldCard";
import OtherRaceEventsList from "./components/OtherRaceEventsList";
import RaceGraph from "./components/RaceGraph";
import {
    calculateRaceDistance,
    otherRaceEventLabels,
    unknownCharaTag,
} from "./utils/RacePresenterUtils";
import {
    calculateTargetSpeed,
    adjustStat,
    getDistanceCategory
} from "../RaceReplay/utils/speedCalculations";
import {
    getPassiveStatModifiers,
    getActiveSpeedModifier,
    getSkillBaseTime,
} from "../RaceReplay/utils/SkillDataUtils";
import courseData from "../../data/tracks/course_data.json";
import RaceReplay from "../RaceReplay/index";

const supportedRaceDataVersion = 100000002;

type RaceDataPresenterProps = {
    raceHorseInfo: any[],
    raceData: RaceSimulateData,
    detectedCourseId?: number,
};

type RaceDataPresenterState = {
    selectedCharaFrameOrder: number | undefined,

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

            showSkills: true,
            showTargetedSkills: true,
            showBlocks: true,
            showTemptationMode: true,
            showOtherRaceEvents: true,
        };
    }

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
        const allOtherEvents: Record<number, { time: number; duration: number; name: string }[]> = {};
        if (!raceData.frame || raceData.frame.length === 0) {
            return allOtherEvents;
        }

        const charaData = new Map<number, TrainedCharaData>();
        const charaRawData = new Map<number, any>();
        if (raceHorseInfo) {
            raceHorseInfo.forEach(data => {
                const frameOrder = data['frame_order'] - 1;
                charaData.set(frameOrder, fromRaceHorseData(data));
                charaRawData.set(frameOrder, data);
            });
        }

        const goalInX = calculateRaceDistance(raceData);
        const distanceCategory = getDistanceCategory(goalInX);
        const trackSlopes = detectedCourseId ? (courseData as any)[detectedCourseId]?.slopes ?? [] : [];

        for (const event of raceData.event) {
            const e = event.event!;
            const frameOrder = e.param[0];
            const startTime = e.frameTime!;

            if (e.type === RaceSimulateEventData_SimulateEventType.COMPETE_FIGHT) {
                const startHp = raceData.frame[0].horseFrame[frameOrder].hp!;
                const hpThreshold = startHp * 0.05;
                let endTime = raceData.frame[raceData.frame.length - 1].time!;

                // Prepare data for speed check
                const trainedChara = charaData.get(frameOrder);
                const rawData = charaRawData.get(frameOrder);
                let checkSpeedCriteria = false;
                let passiveStats = { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 };
                let isOonige = false;
                let strategy = 1;

                if (trainedChara && rawData) {
                    checkSpeedCriteria = true;
                    // Passives
                    const skillEvents = filterCharaSkills(raceData, frameOrder);
                    const activatedSkillIds = new Set(skillEvents.map(ev => ev.param[1]));
                    activatedSkillIds.forEach(id => {
                        const mods = getPassiveStatModifiers(id);
                        passiveStats.speed += (mods.speed || 0);
                        passiveStats.stamina += (mods.stamina || 0);
                        passiveStats.power += (mods.power || 0);
                        passiveStats.guts += (mods.guts || 0);
                        passiveStats.wisdom += (mods.wisdom || 0);
                    });
                    if (activatedSkillIds.has(202051)) isOonige = true;

                    const runningStyleStr = rawData.running_style ?? 0;
                    strategy = +runningStyleStr > 0 ? +runningStyleStr : (trainedChara.rawData?.param?.runningStyle ?? 1);
                }

                // Find start frame index
                let startIndex = 0;
                for (let i = 0; i < raceData.frame.length; i++) {
                    if (raceData.frame[i].time! >= startTime) {
                        startIndex = i;
                        break;
                    }
                }

                for (let i = startIndex; i < raceData.frame.length; i++) {
                    const frame = raceData.frame[i];
                    if (frame.horseFrame[frameOrder].hp! < hpThreshold) {
                        endTime = frame.time!;
                        break;
                    }

                    // Speed Check
                    if (checkSpeedCriteria && trainedChara) {
                        const h = frame.horseFrame[frameOrder];
                        const currentSpeed = (h.speed ?? 0) / 100;
                        const frameTime = frame.time ?? 0;

                        // Calculate Acceleration
                        // Look ahead 1 frame
                        let accel = 0;
                        if (i < raceData.frame.length - 1) {
                            const nextFrame = raceData.frame[i + 1];
                            const nextH = nextFrame.horseFrame[frameOrder];
                            const nextSpeed = (nextH.speed ?? 0) / 100;
                            const dt = (nextFrame.time! - frame.time!);
                            if (dt > 0) {
                                accel = (nextSpeed - currentSpeed) / dt;
                            }
                        }

                        // Get Active Buffs
                        let activeSpeedBuff = 0;
                        if (skillActivations && skillActivations[frameOrder]) {
                            skillActivations[frameOrder].forEach(s => {
                                const baseTime = getSkillBaseTime(s.param[1]);
                                const duration = baseTime > 0 ? (baseTime / 10000) * (goalInX / 1000) : 2.0;
                                if (frameTime >= s.time && frameTime < s.time + duration) {
                                    activeSpeedBuff += getActiveSpeedModifier(s.param[1]);
                                }
                            });
                        }

                        const targetRes = calculateTargetSpeed({
                            courseDistance: goalInX,
                            courseId: detectedCourseId,
                            currentDistance: h.distance ?? 0,
                            speedStat: trainedChara.speed,
                            wisdomStat: trainedChara.wiz,
                            powerStat: trainedChara.pow,
                            gutsStat: trainedChara.guts,
                            staminaStat: trainedChara.stamina,
                            strategy,
                            distanceProficiency: trainedChara.properDistances[distanceCategory] ?? 1,
                            mood: rawData['motivation'],
                            isOonige,
                            inLastSpurt: (h.distance ?? 0) > (raceData.horseResult[frameOrder]?.lastSpurtStartDistance ?? 999999),
                            slope: 0,
                            greenSkillBonuses: passiveStats,
                            activeSpeedBuff: activeSpeedBuff,
                            isDueling: true,
                            isSpotStruggle: false
                        });

                        const dist = h.distance ?? 0;
                        const currentSlopeObj = trackSlopes.find((s: any) => dist >= s.start && dist < s.start + s.length);
                        const currentSlope = currentSlopeObj?.slope ?? 0;
                        if (currentSlope > 0) {
                            // Apply penalty to calculated target speed
                            const slopePer = currentSlope / 10000.;
                            const adjustedPower = adjustStat(trainedChara.pow, rawData['motivation'], passiveStats.power);
                            const penalty = (slopePer * 200) / adjustedPower;
                            targetRes.base -= penalty;
                        }

                        // Check for uphill transition which causes deceleration
                        let isUphillTransition = false;
                        if (i < raceData.frame.length - 1) {
                            const nextFrame = raceData.frame[i + 1];
                            const nextH = nextFrame.horseFrame[frameOrder];
                            const nextDist = nextH.distance ?? 0;
                            const nextSlopeObj = trackSlopes.find((s: any) => nextDist >= s.start && nextDist < s.start + s.length);
                            const nextSlope = nextSlopeObj?.slope ?? 0;

                            if (nextSlope > currentSlope && nextSlope > 0) {
                                isUphillTransition = true;
                            }
                        }

                        // If Target (with Duel) > Current Speed AND Accel is low
                        // Then Duel is likely not active
                        // Ignore if we are slowing down due to hitting a hill
                        if (!isUphillTransition && (targetRes.base > currentSpeed + 0.2) && (accel < 0.1)) {
                            endTime = frameTime;
                            break;
                        }
                    }
                }
                if (!allOtherEvents[frameOrder]) {
                    allOtherEvents[frameOrder] = [];
                }
                allOtherEvents[frameOrder].push({ time: startTime, duration: endTime - startTime, name: "Dueling" });
            }

            if (e.type === RaceSimulateEventData_SimulateEventType.COMPETE_TOP) {
                const guts = charaData.get(frameOrder)?.guts ?? 0;
                const gutsDuration = Math.pow(700 * guts, 0.5) * 0.012;

                const raceDistance = goalInX;
                const distanceThreshold = (9 / 24) * raceDistance;

                let distanceThresholdTime = -1;
                for (let i = 0; i < raceData.frame.length; i++) {
                    const frame = raceData.frame[i];
                    if (frame.horseFrame[frameOrder].distance! >= distanceThreshold) {
                        distanceThresholdTime = frame.time!;
                        break;
                    }
                }

                if (distanceThresholdTime === -1) { // Should not happen
                    distanceThresholdTime = raceData.frame[raceData.frame.length - 1].time!;
                }

                if (startTime < distanceThresholdTime) {
                    const duration = Math.min(gutsDuration, distanceThresholdTime - startTime);
                    if (!allOtherEvents[frameOrder]) {
                        allOtherEvents[frameOrder] = [];
                    }
                    allOtherEvents[frameOrder].push({ time: startTime, duration: duration, name: "Spot Struggle" });
                }
            }
        }

        return allOtherEvents;
    });

    render() {
        return <div>
            {(this.props.raceData.header!.version! > supportedRaceDataVersion) &&
                <Alert variant="warning">
                    RaceData version {this.props.raceData.header!.version!} higher than supported
                    version {supportedRaceDataVersion}, use at your own risk!
                </Alert>}
            <CharaList
                raceHorseInfo={this.props.raceHorseInfo}
                raceData={this.props.raceData}
                detectedCourseId={this.props.detectedCourseId}
                skillActivations={this.skillActivations(this.props.raceData)}
                otherEvents={this.otherEvents(this.props.raceData, this.props.raceHorseInfo, this.props.detectedCourseId, this.skillActivations(this.props.raceData))}
            />
            <FoldCard header="Replay">
                <RaceReplay
                    raceData={this.props.raceData}
                    raceHorseInfo={this.props.raceHorseInfo}
                    displayNames={this.displayNames(this.props.raceHorseInfo, this.props.raceData)}
                    skillActivations={this.skillActivations(this.props.raceData)}
                    otherEvents={this.otherEvents(this.props.raceData, this.props.raceHorseInfo, this.props.detectedCourseId, this.skillActivations(this.props.raceData))}
                    detectedCourseId={this.props.detectedCourseId}
                />
            </FoldCard>
            <OtherRaceEventsList raceData={this.props.raceData} displayNames={this.displayNames(this.props.raceHorseInfo, this.props.raceData)} />
            <Form>
                <Form.Group>
                    <Form.Label>Chara</Form.Label>
                    <Form.Control as="select" custom
                        onChange={(e) => this.setState({ selectedCharaFrameOrder: e.target.value ? parseInt(e.target.value) : undefined })}>
                        <option value="">-</option>
                        {Object.entries(this.displayNames(this.props.raceHorseInfo, this.props.raceData))
                            .sort(([, a], [, b]) => a.localeCompare(b))
                            .map(([frameOrder, displayName]) => {
                                return <option value={frameOrder}>{displayName}</option>;
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
            <hr />
            <JsonViewer value={this.props.raceData.toJson()} defaultInspectDepth={1} theme="dark" />
        </div>;
    }
}

export default RaceDataPresenter;