import React from "react";
import { OverlayTrigger, Popover } from "react-bootstrap";

const InfoHover: React.FC<{ title?: string; content?: React.ReactNode }> = ({
    title = "Replay info",
    content = (
        <ul className="mb-0 ps-3">
            <li><kbd style={{ background: '#444', color: '#fff', padding: '2px 6px', borderRadius: '3px', fontSize: '0.85em', border: '1px solid #555' }}>←</kbd> / <kbd style={{ background: '#444', color: '#fff', padding: '2px 6px', borderRadius: '3px', fontSize: '0.85em', border: '1px solid #555' }}>→</kbd> - Half-speed playback</li>
            <li><kbd style={{ background: '#444', color: '#fff', padding: '2px 6px', borderRadius: '3px', fontSize: '0.85em', border: '1px solid #555' }}>↑</kbd> / <kbd style={{ background: '#444', color: '#fff', padding: '2px 6px', borderRadius: '3px', fontSize: '0.85em', border: '1px solid #555' }}>↓</kbd> - Jump between race frames</li>
        </ul>
    ),
}) => {
    const overlay = (
        <Popover id="race-replay-info"
            style={{
                maxWidth: "48ch",
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
            }}>
            <div className="popover-header py-2" style={{ backgroundColor: '#111827', borderBottom: '1px solid #374151' }}>
                <h3 className="h6 m-0" style={{ color: "#f87171" }}>{title}</h3>
            </div>
            <div className="popover-body" style={{ color: '#e5e7eb' }}>{content}</div>
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
