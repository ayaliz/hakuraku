import { useState, useRef, useEffect, useCallback } from "react";

export function useRafPlayer(start: number, end: number, onFrame?: (time: number) => void) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [time, setTime] = useState(start);
    const [playbackRate, setPlaybackRate] = useState(1);
    const raf = useRef<number | undefined>(undefined);
    const last = useRef<number | undefined>(undefined);
    const tRef = useRef(start);
    const sRef = useRef(start), eRef = useRef(end), pRef = useRef(false), rRef = useRef(1);
    const onFrameRef = useRef(onFrame);
    const throttleRef = useRef(0);

    useEffect(() => { onFrameRef.current = onFrame; });
    useEffect(() => { sRef.current = start; eRef.current = end; }, [start, end]);
    useEffect(() => { pRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { rRef.current = playbackRate; }, [playbackRate]);
    useEffect(() => { if (!isPlaying) setTime(tRef.current); }, [isPlaying]);

    useEffect(() => {
        const tick = (now: number) => {
            if (last.current == null) last.current = now;
            if (pRef.current) {
                const dt = (now - last.current) / 1000;
                let next = tRef.current + dt * rRef.current;
                next = Math.max(sRef.current, Math.min(eRef.current, next));

                last.current = now;
                if (next !== tRef.current) {
                    tRef.current = next;
                    onFrameRef.current?.(next);
                    throttleRef.current++;
                    if (throttleRef.current >= 4) {
                        throttleRef.current = 0;
                        setTime(next);
                    }
                }

                if (rRef.current > 0 && next >= eRef.current) setIsPlaying(false);
                if (rRef.current < 0 && next <= sRef.current) setIsPlaying(false);
            } else last.current = now;
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => { if (raf.current) cancelAnimationFrame(raf.current); };
    }, []);

    const setTimeExternal = useCallback((t: number) => {
        tRef.current = t;
        onFrameRef.current?.(t);
        setTime(t);
    }, []);

    const playPause = useCallback(() => {
        if (!pRef.current) {
            if (rRef.current > 0 && Math.abs(tRef.current - eRef.current) < 1e-6) {
                tRef.current = sRef.current;
                setTime(sRef.current);
            }
            if (rRef.current < 0 && Math.abs(tRef.current - sRef.current) < 1e-6) {
                tRef.current = eRef.current;
                setTime(eRef.current);
            }
        }
        setIsPlaying(p => !p);
    }, []);

    return { time, setTime: setTimeExternal, isPlaying, setIsPlaying, playPause, playbackRate, setPlaybackRate };
}
