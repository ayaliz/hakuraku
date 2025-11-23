import { useState, useRef, useEffect } from "react";

export function useRafPlayer(start: number, end: number) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [time, setTime] = useState(start);
    const [playbackRate, setPlaybackRate] = useState(1);
    const raf = useRef<number>();
    const last = useRef<number>();
    const tRef = useRef(time), sRef = useRef(start), eRef = useRef(end), pRef = useRef(isPlaying), rRef = useRef(playbackRate);
    useEffect(() => { sRef.current = start; eRef.current = end; }, [start, end]);
    useEffect(() => { pRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { tRef.current = time; }, [time]);
    useEffect(() => { rRef.current = playbackRate; }, [playbackRate]);
    useEffect(() => {
        const tick = (now: number) => {
            if (last.current == null) last.current = now;
            if (pRef.current) {
                const dt = (now - last.current) / 1000;
                let next = tRef.current + dt * rRef.current;
                next = Math.max(sRef.current, Math.min(eRef.current, next));

                last.current = now;
                if (next !== tRef.current) setTime(next);

                if (rRef.current > 0 && next >= eRef.current) setIsPlaying(false);
                if (rRef.current < 0 && next <= sRef.current) setIsPlaying(false);
            } else last.current = now;
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => { if (raf.current) cancelAnimationFrame(raf.current); };
    }, []);
    const playPause = () => {
        if (!isPlaying) {
            if (playbackRate > 0 && Math.abs(tRef.current - eRef.current) < 1e-6) setTime(sRef.current);
            if (playbackRate < 0 && Math.abs(tRef.current - sRef.current) < 1e-6) setTime(eRef.current);
        }
        setIsPlaying(p => !p);
    };
    return { time, setTime, isPlaying, setIsPlaying, playPause, playbackRate, setPlaybackRate };
}
