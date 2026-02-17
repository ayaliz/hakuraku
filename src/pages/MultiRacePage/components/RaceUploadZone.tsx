import React, { useCallback, useRef, useState } from "react";
import { Spinner } from "react-bootstrap";

interface RaceUploadZoneProps {
    onFilesSelected: (files: File[]) => void;
    isProcessing: boolean;
}

const RaceUploadZone: React.FC<RaceUploadZoneProps> = ({ onFilesSelected, isProcessing }) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            onFilesSelected(files);
        }
    }, [onFilesSelected]);

    const handleClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
            onFilesSelected(files);
        }
        // Reset input so the same file can be selected again
        e.target.value = "";
    }, [onFilesSelected]);

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                multiple
                style={{ display: "none" }}
                onChange={handleFileChange}
            />
            <div
                className={`multirace-upload-zone ${isDragOver ? "drag-over" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleClick}
            >
                {isProcessing ? (
                    <>
                        <Spinner animation="border" variant="primary" />
                        <div className="upload-text" style={{ marginTop: "15px" }}>
                            Processing files...
                        </div>
                    </>
                ) : (
                    <>
                        <div className="upload-icon">📂</div>
                        <div className="upload-text">
                            Drop race JSON files here or click to browse
                        </div>
                        <div className="upload-subtext">
                            Select multiple files to analyze races together
                        </div>
                    </>
                )}
            </div>
        </>
    );
};

export default RaceUploadZone;
