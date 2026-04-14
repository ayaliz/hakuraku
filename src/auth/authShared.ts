export type AuthUser = {
    id: string;
    accountName: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
};

export type AuthSessionResponse = {
    authenticated: boolean;
    user: AuthUser | null;
};

export type AuthRegisterRequest = {
    accountName: string;
    email: string;
    password: string;
};

export type AuthRegisterResponse = {
    ok: true;
    requiresVerification: true;
    email: string;
};

export type AuthLoginRequest = {
    identifier: string;
    password: string;
};

export type AuthLoginResponse = {
    ok: true;
    user: AuthUser;
};

export type AuthVerifyEmailRequest = {
    token: string;
};

export type AuthVerifyEmailResponse = {
    ok: true;
    user: AuthUser;
};

export type AuthResendVerificationRequest = {
    email?: string;
};

export type AuthMessageResponse = {
    ok: true;
    message: string;
};

export type AuthRequestPasswordResetRequest = {
    email: string;
};

export type AuthResetPasswordRequest = {
    token: string;
    password: string;
};

export type AuthResetPasswordResponse = {
    ok: true;
    user: AuthUser;
};

export type AuthDeleteAccountRequest = {
    password: string;
};

export type StoredShareOwnership = "anonymous" | "account";

export type ShareCreateResponse = {
    ok: true;
    key: string;
    url: string;
    expiresAt: string | null;
    ownership: StoredShareOwnership;
};

export type AccountSharedRaceSummary = {
    shareKey: string;
    shareUrl: string;
    createdAt: string;
    expiresAt: string | null;
    lastAccessedAt: string | null;
};

export type AccountSharedRacesResponse = {
    ok: true;
    races: AccountSharedRaceSummary[];
};

export type AuthLinkedGameAccount = {
    viewerId: number;
    playerName: string | null;
    verificationSource: string;
    verifiedAt: string;
    lastSeenAt: string;
};

export type AccountVeteranSnapshotSummary = {
    available: boolean;
    veteranCount: number | null;
    updatedAt: string | null;
};

export type AccountReplayMemberSummary = {
    frameOrder: number;
    finishOrder: number;
    charaId: number;
    cardId: number;
    strategy: number;
    rankScore?: number;
};

export type AccountReplayTeamSummary = {
    teamId: number;
    isWinnerTeam: boolean;
    teamSignature: string;
    members: AccountReplayMemberSummary[];
};

export type AccountParticipatedRaceSummary = {
    raceUid: string;
    ingestedAt: string;
    finishTime: number;
    roomRunawayCount: number;
    roomFrontCount: number;
    roomPaceCount: number;
    roomLateCount: number;
    roomEndCount: number;
    winnerCardId: number;
    winnerCharaId: number;
    winnerStrategy: number;
    winnerTeam: AccountReplayTeamSummary;
    enemyTeams: AccountReplayTeamSummary[];
    participant: {
        frameOrder: number;
        finishOrder: number;
        teamId: number;
        charaId: number;
        cardId: number;
        strategy: number;
        rankScore: number;
    };
};

export type AccountRaceDatasetSummary = {
    datasetKey: string;
    cmId: string;
    courseId: number;
    datasetLabel: string;
    raceCount: number;
    latestRaceAt: string | null;
    races: AccountParticipatedRaceSummary[];
};

export type AccountRaceDatasetsResponse = {
    ok: true;
    viewerId: number;
    datasets: AccountRaceDatasetSummary[];
};

export type AccountDatasetRaceExportEntry = {
    fileName: string;
    payload: unknown;
};

export type AccountDatasetRaceExportResponse = {
    ok: true;
    viewerId: number;
    datasetKey: string;
    datasetLabel: string;
    raceCount: number;
    races: AccountDatasetRaceExportEntry[];
};

export type AccountHorseActVerificationStartResponse = {
    ok: true;
    verificationId: string;
    apiKey: string;
    serverUrl: string;
    expiresAt: string;
    restartRequired: boolean;
};

export type AccountHorseActVerificationStatus =
    | "not_started"
    | "pending"
    | "verified"
    | "expired"
    | "cancelled"
    | "failed";

export type AccountHorseActVerificationStatusResponse = {
    ok: true;
    status: AccountHorseActVerificationStatus;
    expiresAt: string | null;
    verificationId: string | null;
    lastError: string | null;
    linkedGameAccount: AuthLinkedGameAccount | null;
    veteranSnapshot: AccountVeteranSnapshotSummary;
};

export type AccountHorseActVerificationCancelResponse = {
    ok: true;
    status: "cancelled";
};

export type AccountVeteranRosterResponse = {
    ok: true;
    viewerId: number;
    veteranCount: number;
    updatedAt: string;
    veterans: unknown[];
};
