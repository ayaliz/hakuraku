import { useState, useRef, useEffect } from "react";

export function useRafPlayer(start: number, end: number) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [time, setTime] = useState(start);
    const raf = useRef<number>();
    const last = useRef<number>();
    const tRef = useRef(time), sRef = useRef(start), eRef = useRef(end), pRef = useRef(isPlaying);
    useEffect(() => { sRef.current = start; eRef.current = end; }, [start, end]);
    useEffect(() => { pRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { tRef.current = time; }, [time]);
    useEffect(() => {
        const tick = (now: number) => {
            if (last.current == null) last.current = now;
            if (pRef.current) {
                const dt = (now - last.current) / 1000, next = Math.min(tRef.current + dt, eRef.current);
                last.current = now; if (next !== tRef.current) setTime(next); if (next >= eRef.current) setIsPlaying(false);
            } else last.current = now;
            raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => { if (raf.current) cancelAnimationFrame(raf.current); };
    }, []);
    const playPause = () => { if (!isPlaying && Math.abs(tRef.current - eRef.current) < 1e-6) setTime(sRef.current); setIsPlaying(p => !p); };
    return { time, setTime, isPlaying, setIsPlaying, playPause };
}
