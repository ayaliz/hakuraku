import React from "react";
import { OverlayTrigger, Popover } from "react-bootstrap";

const InfoHover: React.FC<{ title?: string; content?: React.ReactNode }> = ({
    title = "Replay info",
    content = (
        <div>
            <ul className="mb-0 ps-3">
                <li>The visualization for the slopes only represents the slope duration.</li>
                <li>Skill labels are shown for the real skill duration, or for 2 seconds if no duration (e.g. Swinging Maestro).</li>
                <li>For skills triggering on frame 0 (e.g. Groundwork), the game does not report a duration so the replay defaults to 2 seconds.</li>
                <li>I can't tell what track we're on directly from packet data. I currently attempt to guess it from the distance of the race and the CM schedule, but you may need to manually select the track outside of that.</li>
                <li>Track selection only matters for displaying straight/corner sections and slopes correctly.</li>
                <li>The replay always looks at a 50m (20L) slice of the race relative to the position of the frontmost Uma.</li>
                <li>Umas with 0 acceleration on frame 0 of the race have a late start.</li>
                <li>Around 2/3 of the way into the race, you'll typically see a lot of course events labeled "Last Spurt". There'll be one of those per Uma, and it's most relevant when an Uma's last spurt event happens significantly later than 2/3 of the distance, indicating they were too low on HP to attempt a full last spurt. </li>
            </ul>
        </div>
    ),
}) => {
    const overlay = (
        <Popover id="race-replay-info"
            style={{ maxWidth: "48ch" }}>
            <div className="popover-header py-2">
                <h3 className="h6 m-0" style={{ color: "#DC2626" }}>{title}</h3>
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
                className="d-inline-flex align-items-center"
                style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(0,0,0,0.25)",
                    background: "rgba(255,255,255,0.6)",
                    backdropFilter: "blur(2px)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "help",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                }}
            >
                <span
                    aria-hidden
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        border: "1px solid #444",
                        marginRight: 6,
                        fontSize: 12,
                        lineHeight: 1,
                    }}
                >
                    i
                </span>
                Info
            </span>
        </OverlayTrigger>
    );
};

export default InfoHover;
