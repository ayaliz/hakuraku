import React, { useState, useEffect } from "react";
import { Button, Form, Spinner } from "react-bootstrap";


interface ClipMakerProps {
    minTime: number;
    maxTime: number;
    currentTime: number;
    onExport: (start: number, end: number, fps: number) => void;
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

    useEffect(() => {
        setStart((s) => Math.max(minTime, Math.min(maxTime, s)));
        setEnd((e) => Math.max(minTime, Math.min(maxTime, e)));
    }, [minTime, maxTime]);



    const handleExportClick = () => {
        if (start >= end) {
            alert("Start time must be less than end time.");
            return;
        }
        onExport(start, end, fps);
    };

    return (
        <div
            className="d-flex flex-column p-2 mt-2"
            style={{
                backgroundColor: "#222",
                border: "1px solid #444",
                borderRadius: "4px",
                gap: "8px",
                alignItems: "flex-end",
            }}
        >
            <div className="d-flex align-items-center gap-2">
                <div className="d-flex align-items-center gap-1">
                    <Form.Label className="mb-0 text-white" style={{ fontSize: "0.85rem" }}>Start (s):</Form.Label>
                    <Form.Control
                        type="number"
                        value={start}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStart(Number(e.target.value))}
                        step={0.1}
                        style={{ width: "60px", padding: "2px 5px", height: "auto", fontSize: "0.85rem" }}
                    />
                </div>

                <div className="d-flex align-items-center gap-1 ms-2">
                    <Form.Label className="mb-0 text-white" style={{ fontSize: "0.85rem" }}>End (s):</Form.Label>
                    <Form.Control
                        type="number"
                        value={end}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnd(Number(e.target.value))}
                        step={0.1}
                        style={{ width: "60px", padding: "2px 5px", height: "auto", fontSize: "0.85rem" }}
                    />
                </div>
            </div>

            <div className="d-flex align-items-center gap-2" style={{ width: "100%", justifyContent: "flex-end" }}>

                <Form.Control
                    as="select"
                    size="sm"
                    value={fps}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFps(Number(e.target.value))}
                    style={{ width: "auto", padding: "2px 5px", height: "auto", fontSize: "0.85rem" }}
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
                    style={{ fontSize: "0.85rem" }}
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
