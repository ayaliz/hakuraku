import { useMemo } from "react";
import courseData from "../../../data/tracks/course_data.json";
import trackNames from "../../../data/tracks/tracknames.json";
import { SURFACE_MAP } from "../RaceReplay.constants";

export function useAvailableTracks(goalInX: number) {
    return useMemo(() => {
        if (!goalInX) return [] as { id: string; name: string; raceTrackId: number; surface: number }[];
        return Object.entries(courseData as Record<string, any>)
            .filter(([, d]) => d.distance === goalInX)
            .map(([id, d]) => {
                const trackName = (trackNames as Record<string, string[]>)[d.raceTrackId]?.[1] ?? "Unknown";
                const surface = SURFACE_MAP[d.surface] ?? "Unknown";
                const suffix = d.course === 2 ? " (inner)" : d.course === 3 ? " (outer)" : "";
                return { id, name: `${trackName} ${surface} ${d.distance}m${suffix}`, raceTrackId: d.raceTrackId, surface: d.surface };
            });
    }, [goalInX]);
}
