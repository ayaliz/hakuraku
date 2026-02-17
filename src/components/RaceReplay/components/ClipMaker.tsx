import React, { useState, useEffect } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import "../RaceReplay.css";


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
        <div className="d-flex align-items-center p-2 mt-2 clip-maker">
            {/* Time range inputs */}
            <div className="d-flex align-items-center" style={{ gap: "12px" }}>
                <div className="d-flex align-items-center" style={{ gap: "6px" }}>
                    <Form.Label className="mb-0 text-white clip-maker-label">Start (s):</Form.Label>
                    <Form.Control
                        type="number"
                        value={start}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStart(Number(e.target.value))}
                        step={0.1}
                        className="clip-maker-input"
                        style={{ width: "75px" }}
                    />
                </div>

                <div className="d-flex align-items-center" style={{ gap: "6px" }}>
                    <Form.Label className="mb-0 text-white clip-maker-label">End (s):</Form.Label>
                    <Form.Control
                        type="number"
                        value={end}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnd(Number(e.target.value))}
                        step={0.1}
                        className="clip-maker-input"
                        style={{ width: "75px" }}
                    />
                </div>
            </div>

            {/* Speed and FPS controls */}
            <div className="d-flex align-items-center" style={{ gap: "12px" }}>
                <div className="d-flex align-items-center" style={{ gap: "6px" }}>
                    <Form.Label className="mb-0 text-white clip-maker-label">Speed:</Form.Label>
                    <Form.Control
                        type="number"
                        value={speed}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSpeed(Number(e.target.value))}
                        step={0.1}
                        className="clip-maker-input"
                        style={{ width: "60px" }}
                    />
                </div>

                <Form.Control
                    as="select"
                    size="sm"
                    value={fps}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFps(Number(e.target.value))}
                    className="clip-maker-input"
                    style={{ width: "auto" }}
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
                    className="clip-maker-label"
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
