import React from "react";
import { OverlayTrigger, Popover } from "react-bootstrap";
import "../RaceReplay.css";

const InfoHover: React.FC<{ title?: string; content?: React.ReactNode }> = ({
    title = "Replay info",
    content = (
        <ul className="mb-0 ps-3">
            <li><kbd className="kbd-key">←</kbd> / <kbd className="kbd-key">→</kbd> - Half-speed playback</li>
            <li><kbd className="kbd-key">↑</kbd> / <kbd className="kbd-key">↓</kbd> - Jump between race frames</li>
        </ul>
    ),
}) => {
    const overlay = (
        <Popover id="race-replay-info" style={{ maxWidth: "48ch" }}>
            <div className="popover-header py-2">
                <h3 className="h6 m-0" style={{ color: "#f87171" }}>{title}</h3>
            </div>
            <div className="popover-body">{content}</div>
        </Popover>
    );

    return (
        <OverlayTrigger placement="top" delay={{ show: 150, hide: 80 }} overlay={overlay} trigger={["hover", "focus"]}>
            <span
                role="button"
                tabIndex={0}
                aria-label="Replay information"
                className="d-inline-flex align-items-center replay-info-btn"
            >
                <span
                    aria-hidden
                    className="replay-info-icon"
                >
                    i
                </span>
                Info
            </span>
        </OverlayTrigger>
    );
};

export default InfoHover;
