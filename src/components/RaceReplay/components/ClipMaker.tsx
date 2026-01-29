import React, { useState, useEffect } from "react";
import { Button, Form, Spinner } from "react-bootstrap";


interface ClipMakerProps {
    minTime: number;
    maxTime: number;
    currentTime: number;
    onExport: (start: number, end: number, fps: number, playbackSpeed: number) => void;
    isExporting: boolean;
}

const ClipMaker: React.FC<ClipMakerProps> = ({
    minTime,
    maxTime,
    currentTime,
    onExport,
    isExporting,
}) => {
    const [start, setStart] = useState(minTime);
    const [end, setEnd] = useState(maxTime);
    const [fps, setFps] = useState(60);
    const [speed, setSpeed] = useState(1.0);

    useEffect(() => {
        setStart((s) => Math.max(minTime, Math.min(maxTime, s)));
        setEnd((e) => Math.max(minTime, Math.min(maxTime, e)));
    }, [minTime, maxTime]);



    const handleExportClick = () => {
        if (start >= end) {
            alert("Start time must be less than end time.");
            return;
        }
        onExport(start, end, fps, speed);
    };

    return (
        <div
            className="d-flex align-items-center p-2 mt-2"
            style={{
                backgroundColor: "#222",
                border: "1px solid #444",
                borderRadius: "6px",
                gap: "16px",
                flexWrap: "wrap",
            }}
        >
            {/* Time range inputs */}
            <div className="d-flex align-items-center" style={{ gap: "12px" }}>
                <div className="d-flex align-items-center" style={{ gap: "6px" }}>
                    <Form.Label className="mb-0 text-white" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>Start (s):</Form.Label>
                    <Form.Control
                        type="number"
                        value={start}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStart(Number(e.target.value))}
                        step={0.1}
                        style={{ width: "75px", padding: "4px 8px", height: "auto", fontSize: "0.85rem" }}
                    />
                </div>

                <div className="d-flex align-items-center" style={{ gap: "6px" }}>
                    <Form.Label className="mb-0 text-white" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>End (s):</Form.Label>
                    <Form.Control
                        type="number"
                        value={end}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnd(Number(e.target.value))}
                        step={0.1}
                        style={{ width: "75px", padding: "4px 8px", height: "auto", fontSize: "0.85rem" }}
                    />
                </div>
            </div>

            {/* Speed and FPS controls */}
            <div className="d-flex align-items-center" style={{ gap: "12px" }}>
                <div className="d-flex align-items-center" style={{ gap: "6px" }}>
                    <Form.Label className="mb-0 text-white" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>Speed:</Form.Label>
                    <Form.Control
                        type="number"
                        value={speed}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSpeed(Number(e.target.value))}
                        step={0.1}
                        style={{ width: "60px", padding: "4px 8px", height: "auto", fontSize: "0.85rem" }}
                    />
                </div>

                <Form.Control
                    as="select"
                    size="sm"
                    value={fps}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFps(Number(e.target.value))}
                    style={{ width: "auto", padding: "4px 8px", height: "auto", fontSize: "0.85rem" }}
                    title="Frame Rate"
                >
                    <option value={30}>30 FPS</option>
                    <option value={60}>60 FPS</option>
                </Form.Control>

                <Button
                    variant="primary"
                    size="sm"
                    onClick={handleExportClick}
                    disabled={isExporting}
                    style={{ fontSize: "0.85rem", whiteSpace: "nowrap", padding: "4px 12px" }}
                >
                    {isExporting ? (
                        <>
                            <Spinner
                                as="span"
                                animation="border"
                                size="sm"
                                role="status"
                                aria-hidden="true"
                                className="me-1"
                            />
                            Creating...
                        </>
                    ) : (
                        "Create Clip"
                    )}
                </Button>
            </div>
        </div >
    );
};

export default ClipMaker;
