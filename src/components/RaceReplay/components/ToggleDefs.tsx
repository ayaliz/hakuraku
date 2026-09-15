import React from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { Toggles } from "../hooks/useToggles";

export type ToggleDef = { id: keyof Toggles; label: React.ReactNode };

const INFO_ICON = "\u24D8";

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
                    <span className="toggle-info-icon">{INFO_ICON}</span>
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
                            Shows remaining time on skill and timed race-state labels, such as "Groundwork 3.0s", "Pace Up 2.1s", or "Fully Charged 4.2s". Requires Skill labels to be enabled.
                        </Tooltip>
                    }
                >
                    <span className="toggle-info-icon">{INFO_ICON}</span>
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
                    <span className="toggle-info-icon">{INFO_ICON}</span>
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
                    <span className="toggle-info-icon">{INFO_ICON}</span>
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
                    <span className="toggle-info-icon">{INFO_ICON}</span>
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
                            Detailed simulations use the simulator's acceleration rate; recorded races derive it from the speed change between adjacent frames.
                        </Tooltip>
                    }
                >
                    <span className="toggle-info-icon">{INFO_ICON}</span>
                </OverlayTrigger>
            </span>
        ),
    },
    {
        id: "heuristics",
        label: (
            <span>
                Race modes
                <OverlayTrigger
                    placement="top"
                    overlay={
                        <Tooltip id="heuristics-info-tooltip">
                            Displays Position Keep and related race modes. Detailed simulations use exact simulator state; recorded races use estimates.
                        </Tooltip>
                    }
                >
                    <span className="toggle-info-icon">{INFO_ICON}</span>
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
                    <span className="toggle-info-icon">{INFO_ICON}</span>
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
                    <span className="toggle-info-icon">{INFO_ICON}</span>
                </OverlayTrigger>
            </span>
        ),
    },
    {
        id: "minimap",
        label: (
            <span>
                Course map
                <OverlayTrigger
                    placement="top"
                    overlay={
                        <Tooltip id="course-map-info-tooltip">
                            Shows a small overlay of the selected course and highlights the portion currently visible in the replay.
                        </Tooltip>
                    }
                >
                    <span className="toggle-info-icon">{INFO_ICON}</span>
                </OverlayTrigger>
            </span>
        ),
    },
];
