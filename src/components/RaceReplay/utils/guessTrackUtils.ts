
import courseData from "../../../data/tracks/course_data.json";
import trackNames from "../../../data/tracks/tracknames.json";
import cups from "../../../data/tracks/cups.json";
import { SURFACE_MAP } from "../RaceReplay.constants";

export interface TrackInfo {
    id: string;
    name: string;
    raceTrackId: number;
    surface: number;
}

export function getAvailableTracks(goalInX: number): TrackInfo[] {
    if (!goalInX) return [];
    return Object.entries(courseData as Record<string, any>)
        .filter(([, d]) => d.distance === goalInX)
        .map(([id, d]) => {
            const trackName = (trackNames as Record<string, string[]>)[d.raceTrackId]?.[1] ?? "Unknown";
            const surface = SURFACE_MAP[d.surface] ?? "Unknown";
            const suffix = d.course === 2 ? " (inner)" : d.course === 3 ? " (outer)" : "";
            return { id, name: `${trackName} ${surface} ${d.distance}m${suffix}`, raceTrackId: d.raceTrackId, surface: d.surface };
        });
}

export function guessTrackId(detectedCourseId: number | undefined, goalInX: number, availableTracks: TrackInfo[]): { id: string | null, status: "detected" | "guessed" | "fallback" | "none" } {
    if (!goalInX || !availableTracks.length) {
        return { id: null, status: "none" };
    }

    // 1. Try to use detected Course ID from wrapper JSON
    if (detectedCourseId) {
        const idStr = String(detectedCourseId);
        // Check if this ID exists in our course database
        const exists = (courseData as Record<string, any>)[idStr];

        if (exists) {
            return { id: idStr, status: "detected" };
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
            if (match) {
                return { id: match.id, status: "guessed" };
            }
        }
    }

    if (availableTracks.length) {
        return { id: availableTracks[0].id, status: "fallback" };
    }

    return { id: null, status: "none" };
}
