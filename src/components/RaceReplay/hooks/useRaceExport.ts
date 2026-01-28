import { useState } from "react";

export function useRaceExport(
    echartsRef: any,
    renderTime: number,
    isPlaying: boolean,
    playPause: () => void,
    setRenderTime: (t: number) => void
) {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async (start: number, end: number, fps: number, playbackSpeed: number) => {
        if (isExporting) return;
        setIsExporting(true);
        const originalTime = renderTime;
        const wasPlaying = isPlaying;
        if (wasPlaying) playPause();

        try {
            const chartInstance = echartsRef.current?.getEchartsInstance();
            if (!chartInstance) throw new Error("Chart instance not found");

            const dom = chartInstance.getDom();
            const width = dom.clientWidth;
            const height = dom.clientHeight;

            const { Muxer, ArrayBufferTarget } = await import("webm-muxer");

            const muxer = new Muxer({
                target: new ArrayBufferTarget(),
                video: {
                    codec: "V_VP9",
                    width,
                    height,
                    frameRate: fps,
                },
            });

            const videoEncoder = new VideoEncoder({
                output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
                error: (e) => {
                    console.error(e);
                    alert("Video encoding error: " + e.message);
                },
            });

            const config: VideoEncoderConfig = {
                codec: "vp09.00.10.08",
                width,
                height,
                bitrate: 1_000_000,
                framerate: fps,
            };

            const support = await VideoEncoder.isConfigSupported(config);
            if (!support.supported) {
                console.warn("VP9 config not supported, trying default VP8 or loosening params");
            }

            videoEncoder.configure(config);

            const dt = playbackSpeed / fps;
            const destCanvas = document.createElement("canvas");
            const dpr = window.devicePixelRatio || 1;
            destCanvas.width = width * dpr;
            destCanvas.height = height * dpr;
            const ctx = destCanvas.getContext("2d");
            if (!ctx) throw new Error("Could not get 2d context");

            let frameCount = 0;

            for (let t = start; t <= end; t += dt) {
                setRenderTime(t);

                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                ctx.clearRect(0, 0, destCanvas.width, destCanvas.height);
                ctx.fillStyle = "#1e1e1e";
                ctx.fillRect(0, 0, destCanvas.width, destCanvas.height);

                const canvases = dom.querySelectorAll("canvas");
                canvases.forEach((c: HTMLCanvasElement) => {
                    ctx.drawImage(c, 0, 0);
                });

                const frame = new VideoFrame(destCanvas, { timestamp: frameCount * (1000000 / fps) });

                videoEncoder.encode(frame);
                frame.close();
                frameCount++;
            }

            await videoEncoder.flush();
            muxer.finalize();

            const { buffer } = muxer.target;
            const blob = new Blob([buffer], { type: "video/webm" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `race_replay_${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
            a.click();
            URL.revokeObjectURL(url);

        } catch (e: any) {
            console.error(e);
            alert("Export failed: " + e.message);
        } finally {
            setIsExporting(false);
            setRenderTime(originalTime);
            if (wasPlaying) playPause();
        }
    };

    return { isExporting, handleExport };
}
