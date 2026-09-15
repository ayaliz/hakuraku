import { useEffect, useState } from "react";

import type { HorseEntry } from "../../../pages/MultiRacePage/types";
import { buildRaceTeamUrl, deserializeHorseEntries, type SerializedHorseEntry } from "./umaLogsApi";

type RaceTeamResponse = {
    raceUid: string;
    teamId: number;
    horses: SerializedHorseEntry[];
};

type UseRaceTeamOptions = {
    raceId: string;
    teamId: number;
    enabled: boolean;
};

export function useRaceTeam({ raceId, teamId, enabled }: UseRaceTeamOptions) {
    const [horses, setHorses] = useState<HorseEntry[] | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setHorses(null);
            setLoading(false);
            return;
        }
        if (teamId <= 0 || !raceId) {
            setHorses([]);
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        setLoading(true);
        fetch(buildRaceTeamUrl(raceId, teamId), { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error(`Failed to load teammates: HTTP ${response.status}`);
                const payload = await response.json() as RaceTeamResponse;
                setHorses(deserializeHorseEntries(payload.horses));
            })
            .catch((error: unknown) => {
                if (error instanceof DOMException && error.name === "AbortError") return;
                setHorses([]);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [enabled, raceId, teamId]);

    return { horses, loading };
}
