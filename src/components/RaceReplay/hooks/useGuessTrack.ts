import { useState, useEffect } from "react";
import cups from "../../../data/tracks/cups.json";
import trackNames from "../../../data/tracks/tracknames.json";
import courseData from "../../../data/tracks/course_data.json";

export function useGuessTrack(detectedCourseId: number | undefined, goalInX: number, availableTracks: { id: string; raceTrackId: number; surface: number }[]) {
    const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
    const [guessStatus, setGuessStatus] = useState<"detected" | "guessed" | "fallback" | "none">("none");

    useEffect(() => {
        if (!goalInX || !availableTracks.length) {
            setSelectedTrackId(null);
            setGuessStatus("none");
            return;
        }

        // 1. Try to use detected Course ID from wrapper JSON
        if (detectedCourseId) {
            const idStr = String(detectedCourseId);
            // Check if this ID exists in our course database
            const exists = (courseData as Record<string, any>)[idStr];

            if (exists) {
                setSelectedTrackId(idStr);
                setGuessStatus("detected");
                return;
            }
        }

        // 2. Fallback to existing date-based guess
        const now = new Date();
        const relevant = (cups.cups as any[]).filter((c: any) => c.distance === goalInX).map((c: any) => ({ ...c, date: new Date(c.date) })).sort((a: any, b: any) => a.date.getTime() - b.date.getTime());
        const past = relevant.filter(c => c.date <= now);
        let guess: any = null;
        if (past.length) {
            const last = past[past.length - 1];
            if (now.getTime() - last.date.getTime() < 14 * 24 * 60 * 60 * 1000) guess = last;
        }
        if (!guess) guess = relevant.find(c => c.date > now) ?? past[past.length - 1] ?? null;
        if (guess) {
            const entry = Object.entries(trackNames as Record<string, string[]>).find(([, names]) => names[1] === guess.track);
            if (entry) {
                const raceTrackId = parseInt(entry[0], 10);
                const match = availableTracks.find(t => t.raceTrackId === raceTrackId && t.surface === guess.surface);
                if (match) { setSelectedTrackId(match.id); setGuessStatus("guessed"); return; }
            }
        }
        if (availableTracks.length) { setSelectedTrackId(availableTracks[0].id); setGuessStatus("fallback"); }
        else { setSelectedTrackId(null); setGuessStatus("none"); }
    }, [detectedCourseId, goalInX, availableTracks]);
    return { selectedTrackId, setSelectedTrackId, guessStatus };
}
