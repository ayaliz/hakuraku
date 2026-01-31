import { useState, useEffect } from "react";
import { guessTrackId, TrackInfo } from "../utils/guessTrackUtils";

export function useGuessTrack(detectedCourseId: number | undefined, goalInX: number, availableTracks: TrackInfo[]) {
    const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
    const [guessStatus, setGuessStatus] = useState<"detected" | "guessed" | "fallback" | "none">("none");

    useEffect(() => {
        const result = guessTrackId(detectedCourseId, goalInX, availableTracks);
        setSelectedTrackId(result.id);
        setGuessStatus(result.status);
    }, [detectedCourseId, goalInX, availableTracks]);

    return { selectedTrackId, setSelectedTrackId, guessStatus };
}
