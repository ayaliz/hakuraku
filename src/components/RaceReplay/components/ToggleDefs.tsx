import React from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { Toggles } from "../hooks/useToggles";

export type ToggleDef = { id: keyof Toggles; label: React.ReactNode };

export const toggleDefs: ToggleDef[] = [
    {
        id: "skills",
        label: (
            <span>
                Skill labels
                <OverlayTrigger
                    placement="top"
                    overlay={
                        <Tooltip id="skills-info-tooltip">
                            Toggles popups above Umas' heads to display skill procs and assorted race events like dueling. Skills with no duration (e.g. Swinging Maestro) are shown for 2 seconds.
                        </Tooltip>
                    }
                >
                    <span className="toggle-info-icon">ⓘ</span>
                </OverlayTrigger>
            </span>
        ),
    },
    {
        id: "skillDuration",
        label: (
            <span>
                Skill timers
                <OverlayTrigger
                    placement="top"
                    overlay={
                        <Tooltip id="skill-duration-info-tooltip">
                            Shows remaining duration in seconds on skill labels (e.g. "Groundwork 3.0s"). Requires Skill labels to be enabled.
                        </Tooltip>
                    }
                >
                    <span className="toggle-info-icon">ⓘ</span>
                </OverlayTrigger>
            </span>
        ),
    },
    {
        id: "hp",
        label: (
            <span>
                HP Bar
                <OverlayTrigger
                    placement="top"
                    overlay={
                        <Tooltip id="hp-info-tooltip">
                            Toggles an HP bar to visualize remaining HP; displays numeric values and estimates for time to live during late-race.
                        </Tooltip>
                    }
                >
                    <span className="toggle-info-icon">ⓘ</span>
                </OverlayTrigger>
            </span>
        ),
    },
    {
        id: "blocked",
        label: (
            <span>
                Block indicator
                <OverlayTrigger
                    placement="top"
                    overlay={
                        <Tooltip id="blocked-info-tooltip">
                            Directly received from the server, but due to the low frequency of race frames during most of the race, short blocks can be missed.
                        </Tooltip>
                    }
                >
                    <span className="toggle-info-icon">ⓘ</span>
                </OverlayTrigger>
            </span>
        ),
    },
    {
        id: "slopes",
        label: (
            <span>
                Slopes
                <OverlayTrigger
                    placement="top"
                    overlay={
                        <Tooltip id="slopes-info-tooltip">
                            Visualizes uphills and downhills on the replay; the visuals are not to scale - refer to the value displayed at the start of each slope for its angle.
                        </Tooltip>
                    }
                >
                    <span className="toggle-info-icon">ⓘ</span>
                </OverlayTrigger>
            </span>
        ),
    },
    {
        id: "speed",
        label: (
            <span>
                Speed [m/s]
                <OverlayTrigger
                    placement="top"
                    overlay={
                        <Tooltip id="speed-info-tooltip">
                            Directly received from the server for each race frame; inter-frame values are interpolated.
                        </Tooltip>
                    }
                >
                    <span className="toggle-info-icon">ⓘ</span>
                </OverlayTrigger>
            </span>
        ),
    },
    {
        id: "accel",
        label: (
            <span>
                Acceleration [m/s^2]
                <OverlayTrigger
                    placement="top"
                    overlay={
                        <Tooltip id="accel-info-tooltip">
                            Not directly received from the server, derived via the speed change between the current and next race frame.
                        </Tooltip>
                    }
                >
                    <span className="toggle-info-icon">ⓘ</span>
                </OverlayTrigger>
            </span>
        ),
    },
    {
        id: "heuristics",
        label: (
            <span>
                Mode heuristics
                <OverlayTrigger
                    placement="top"
                    overlay={
                        <Tooltip id="heuristics-info-tooltip">
                            Attempts to display when Umas are in Pace Up, Pace Down, Overtake, or Speed Up mode during Position Keep.
                        </Tooltip>
                    }
                >
                    <span className="toggle-info-icon">ⓘ</span>
                </OverlayTrigger>
            </span>
        ),
    },
    {
        id: "course",
        label: (
            <span>
                Course events
                <OverlayTrigger
                    placement="top"
                    overlay={
                        <Tooltip id="course-events-info-tooltip">
                            Toggles display for assorted information like corners, straights, slopes, and race sections.
                        </Tooltip>
                    }
                >
                    <span className="toggle-info-icon">ⓘ</span>
                </OverlayTrigger>
            </span>
        ),
    },
    {
        id: "positionKeep",
        label: (
            <span>
                Position Keep
                <OverlayTrigger
                    placement="top"
                    overlay={
                        <Tooltip id="position-keep-info-tooltip">
                            Displays position keep zones for each style: when you're ahead of the displayed area you are hit with Pace Down, if you're behind it you roll Wit checks for Pace Up.
                        </Tooltip>
                    }
                >
                    <span className="toggle-info-icon">ⓘ</span>
                </OverlayTrigger>
            </span>
        ),
    },
];
