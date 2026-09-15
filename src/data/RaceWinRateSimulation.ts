export type RaceWinRateBatchStatus = "queued" | "running" | "cancel_requested" | "completed" | "cancelled" | "failed";

export type RaceWinRateRunner = {
    slot: number;
    teamIndex: number;
    memberIndex: number;
    teamId: string;
    frameOrder: number;
    gateNumber: number;
    cardId: number;
    charaId: number;
    wins: number;
    winRate: number;
};

export type RaceWinRateTeam = {
    teamId: string;
    wins: number;
    winRate: number;
};

export type RaceWinRateBatch = {
    jobId: string;
    accessToken?: string;
    status: RaceWinRateBatchStatus;
    seedStart: number;
    totalRaces: number;
    completedRaces: number;
    progress: number;
    queue: { position: number; jobsAhead: number; racesAhead: number } | null;
    results: {
        engineBuild: string | null;
        teams: RaceWinRateTeam[];
        runners: RaceWinRateRunner[];
    };
    error: string | null;
    links: {
        status: string;
        heartbeat: string;
        cancel: string;
    };
};

export function isActiveRaceWinRateBatch(batch: RaceWinRateBatch | undefined): boolean {
    return batch?.status === "queued" || batch?.status === "running" || batch?.status === "cancel_requested";
}

export function raceWinRatePercent(value: number): string {
    return `${(value * 100).toFixed(1).replace(/\.0$/, "")}%`;
}
