import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Form, Modal, Spinner } from "react-bootstrap";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import PaginationControls from "../components/PaginationControls";
import type {
    AccountParticipatedRaceSummary,
    AccountRaceDatasetSummary,
    AccountRaceDatasetsResponse,
    AccountSharedRaceSummary,
    AccountSharedRacesResponse,
    AccountHorseActVerificationStartResponse,
    AccountHorseActVerificationStatusResponse,
    AccountVeteranSnapshotSummary,
    AuthDeleteAccountRequest,
    AuthMessageResponse,
} from "../auth/authShared";
import { getCharaIcon } from "./MultiRacePage/components/WinDistributionCharts/utils";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "./MultiRacePage/components/WinDistributionCharts/constants";
import { getRankIcon } from "../components/RaceDataPresenter/components/CharaList/rankUtils";
import { fromRaceHorseData } from "../data/TrainedCharaData";
import UMDatabaseWrapper from "../data/UMDatabaseWrapper";
import "./AuthPage.css";
import "./AccountPage.css";

const ACCOUNT_LIST_PAGE_SIZE = 20;

type LineupHorse = {
    charaId: number;
    cardId: number;
    strategy: number;
    teamId: number;
    rankScore: number;
};

function parseLineupFromPayload(data: unknown): LineupHorse[] {
    if (!data || typeof data !== "object") return [];
    const raw = (data as Record<string, unknown>).raceHorseInfo;
    if (!raw) return [];
    let horses: unknown[];
    try {
        horses = typeof raw === "string" ? (JSON.parse(raw) as unknown[]) : (raw as unknown[]);
        if (!Array.isArray(horses)) return [];
    } catch {
        return [];
    }
    return horses
        .map((h: unknown) => {
            if (!h || typeof h !== "object") return null;
            const horse = h as Record<string, unknown>;
            const charaId = Number(horse.chara_id ?? horse.charaId ?? 0);
            const cardId = Number(horse.card_id ?? horse.cardId ?? 0);
            const strategy = Number(horse.running_style ?? horse.strategy ?? horse.runningStyle ?? 0);
            const teamId = Number(horse.team_id ?? horse.teamId ?? 0);
            const { rankScore } = fromRaceHorseData(horse);
            return charaId > 0 ? { charaId, cardId, strategy, teamId, rankScore } : null;
        })
        .filter((h): h is LineupHorse => h !== null);
}

function SharedRaceLineup({ shareKey }: { shareKey: string }) {
    const [horses, setHorses] = useState<LineupHorse[] | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetch(`/api/share/${encodeURIComponent(shareKey)}`, { credentials: "same-origin" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data: unknown) => {
                if (!cancelled) {
                    setHorses(parseLineupFromPayload(data));
                    setLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [shareKey]);

    if (loading) {
        return (
            <div className="account-race-lineup account-race-lineup--loading">
                {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="account-race-lineup-skeleton" />
                ))}
            </div>
        );
    }

    if (!horses || horses.length === 0) return null;

    const teamMap = new Map<number, LineupHorse[]>();
    for (const horse of horses) {
        const bucket = teamMap.get(horse.teamId) ?? [];
        bucket.push(horse);
        teamMap.set(horse.teamId, bucket);
    }
    const teams = [...teamMap.entries()].sort(([a], [b]) => a - b);

    return (
        <div className="account-race-lineup" aria-label="Race teams">
            {teams.map(([teamId, members], teamIndex) => (
                <span key={teamId} className="account-race-lineup-team-wrap">
                    {teamIndex > 0 && <span className="account-race-lineup-sep">|</span>}
                    <span className="account-race-lineup-team">
                        {members.map((horse, i) => {
                            const icon = getCharaIcon(`${horse.charaId}_${horse.cardId}`);
                            const color = STRATEGY_COLORS[horse.strategy] ?? "#718096";
                            return (
                                <span
                                    key={i}
                                    className="account-race-lineup-member"
                                    style={{ "--lineup-style-color": color } as React.CSSProperties}
                                >
                                    <span className="account-race-lineup-frame">
                                        {icon ? (
                                            <img
                                                src={icon}
                                                alt=""
                                                className="account-race-lineup-img"
                                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                            />
                                        ) : (
                                            <span className="account-race-lineup-fallback">{horse.cardId}</span>
                                        )}
                                    </span>
                                    <span
                                        className="account-race-lineup-rank"
                                        title={horse.rankScore ? horse.rankScore.toLocaleString() : undefined}
                                    >
                                        {(() => {
                                            const rankInfo = getRankIcon(horse.rankScore);
                                            return rankInfo.icon ? (
                                                <img
                                                    src={rankInfo.icon}
                                                    alt={rankInfo.name}
                                                    className="account-race-lineup-rank-icon"
                                                />
                                            ) : null;
                                        })()}
                                    </span>
                                </span>
                            );
                        })}
                    </span>
                </span>
            ))}
        </div>
    );
}

function toRaceRouteId(raceUid: string): string {
    const lastSegment = raceUid.split("/").pop() ?? raceUid;
    return lastSegment.endsWith(".json") ? lastSegment.slice(0, -5) : lastSegment;
}

function formatParticipatedRaceLabel(race: AccountParticipatedRaceSummary): string {
    const resultLabel = race.participant.finishOrder === 1 ? "Win" : "Loss";
    const winnerCharaName = UMDatabaseWrapper.charas[race.winnerCharaId]?.name ?? `Chara ${race.winnerCharaId}`;
    const winnerStrategyName = STRATEGY_NAMES[race.winnerStrategy] ?? String(race.winnerStrategy);
    return `${resultLabel} (${winnerCharaName} - ${winnerStrategyName})`;
}

function getParticipatedRaceKey(race: AccountParticipatedRaceSummary): string {
    return [
        race.raceUid,
        race.ingestedAt,
        race.participant.teamId,
        race.participant.frameOrder,
        race.participant.cardId,
        race.participant.strategy,
    ].join(":");
}

function orderWinnerTeamMembers<T extends { cardId: number; strategy: number; finishOrder: number }>(
    members: T[],
    winnerCardId: number,
    winnerStrategy: number,
): T[] {
    const winner = members.find((member) =>
        member.cardId === winnerCardId && member.strategy === winnerStrategy && member.finishOrder === 1,
    );
    if (!winner) return members;
    return [winner, ...members.filter((member) => member !== winner)];
}

function AccountReplayLineup({
    race,
}: {
    race: AccountParticipatedRaceSummary;
}) {
    const teams = [
        { ...race.winnerTeam, members: orderWinnerTeamMembers(race.winnerTeam.members, race.winnerCardId, race.winnerStrategy) },
        ...race.enemyTeams,
    ];
    return (
        <div className="account-race-lineup" aria-label="Race teams">
            {teams.map((team, teamIndex) => (
                <span key={team.teamId} className="account-race-lineup-team-wrap">
                    {teamIndex > 0 && <span className="account-race-lineup-sep">|</span>}
                    <span className="account-race-lineup-team">
                        {team.members.map((member) => {
                            const icon = getCharaIcon(`${member.charaId}_${member.cardId}`);
                            const color = STRATEGY_COLORS[member.strategy] ?? "#718096";
                            const rankInfo = getRankIcon(member.rankScore ?? 0);
                            const isRaceWinner = team.isWinnerTeam
                                && member.cardId === race.winnerCardId
                                && member.strategy === race.winnerStrategy
                                && member.finishOrder === 1;
                            return (
                                <span
                                    key={`${team.teamId}-${member.frameOrder}`}
                                    className={`account-race-lineup-member${isRaceWinner ? " is-race-winner" : ""}`}
                                    style={{ "--lineup-style-color": color } as React.CSSProperties}
                                >
                                    <span className="account-race-lineup-frame">
                                        {icon ? (
                                            <img
                                                src={icon}
                                                alt=""
                                                className="account-race-lineup-img"
                                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                            />
                                        ) : (
                                            <span className="account-race-lineup-fallback">{member.cardId}</span>
                                        )}
                                    </span>
                                    <span
                                        className="account-race-lineup-rank"
                                        title={member.rankScore ? member.rankScore.toLocaleString() : undefined}
                                    >
                                        {rankInfo.icon ? (
                                            <img
                                                src={rankInfo.icon}
                                                alt={rankInfo.name}
                                                className="account-race-lineup-rank-icon"
                                            />
                                        ) : null}
                                    </span>
                                </span>
                            );
                        })}
                    </span>
                </span>
            ))}
        </div>
    );
}

async function readError(response: Response): Promise<string> {
    try {
        const payload = await response.json() as { error?: string };
        return payload.error ?? `HTTP ${response.status}`;
    } catch {
        return `HTTP ${response.status}`;
    }
}

export default function AccountPage() {
    const { loading, authenticated, user, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const sharedRacesSectionRef = useRef<HTMLDivElement | null>(null);
    const datasetSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [deletePassword, setDeletePassword] = useState("");
    const [deleteConfirm, setDeleteConfirm] = useState("");
    const [verificationLoading, setVerificationLoading] = useState(true);
    const [verificationBusy, setVerificationBusy] = useState(false);
    const [verificationError, setVerificationError] = useState<string | null>(null);
    const [verificationStatus, setVerificationStatus] = useState<AccountHorseActVerificationStatusResponse | null>(null);
    const [verificationSecret, setVerificationSecret] = useState<AccountHorseActVerificationStartResponse | null>(null);
    const [sharedRaceLoading, setSharedRaceLoading] = useState(true);
    const [sharedRaceError, setSharedRaceError] = useState<string | null>(null);
    const [sharedRaces, setSharedRaces] = useState<AccountSharedRaceSummary[]>([]);
    const [sharedRaceBusyKey, setSharedRaceBusyKey] = useState<string | null>(null);
    const [sharedRacesPage, setSharedRacesPage] = useState(1);
    const [accountRaceLoading, setAccountRaceLoading] = useState(true);
    const [accountRaceError, setAccountRaceError] = useState<string | null>(null);
    const [accountRaceDatasets, setAccountRaceDatasets] = useState<AccountRaceDatasetSummary[]>([]);
    const [accountRacePages, setAccountRacePages] = useState<Record<string, number>>({});
    const [accountRaceViewerId, setAccountRaceViewerId] = useState<number | null>(null);
    const [accountRaceImportKey, setAccountRaceImportKey] = useState<string | null>(null);
    const [dangerOpen, setDangerOpen] = useState(false);
    const [showHorseActInstructions, setShowHorseActInstructions] = useState(false);
    const verificationRequestVersionRef = useRef(0);
    const verificationGraceUntilRef = useRef(0);
    const redirectTarget = encodeURIComponent(location.pathname || "/account");
    const linkedGameAccount = verificationStatus?.linkedGameAccount ?? null;
    const veteranSnapshot: AccountVeteranSnapshotSummary = verificationStatus?.veteranSnapshot ?? {
        available: false,
        veteranCount: null,
        updatedAt: null,
    };
    const verificationStatusLabel = verificationStatus?.status ?? "not_started";

    useEffect(() => {
        if (!authenticated || !user) {
            setVerificationLoading(false);
            setVerificationStatus(null);
            setVerificationSecret(null);
            return;
        }

        let cancelled = false;
        const loadStatus = async (showSpinner: boolean) => {
            const requestVersion = ++verificationRequestVersionRef.current;
            if (showSpinner) {
                setVerificationLoading(true);
            }
            try {
                const response = await fetch("/api/account/horseact-verification/status", {
                    credentials: "same-origin",
                });
                if (cancelled || requestVersion !== verificationRequestVersionRef.current) {
                    return;
                }
                if (!response.ok) {
                    if (!cancelled && requestVersion === verificationRequestVersionRef.current) {
                        setVerificationError(await readError(response));
                    }
                    return;
                }
                const payload = await response.json() as AccountHorseActVerificationStatusResponse;
                if (!cancelled && requestVersion === verificationRequestVersionRef.current) {
                    setVerificationStatus(payload);
                    setVerificationError(payload.lastError);
                    if (["verified", "cancelled", "expired", "failed"].includes(payload.status)) {
                        setVerificationSecret(null);
                    }
                }
            } catch (fetchError) {
                if (!cancelled && requestVersion === verificationRequestVersionRef.current) {
                    setVerificationError(fetchError instanceof Error ? fetchError.message : String(fetchError));
                }
            } finally {
                if (!cancelled && showSpinner && requestVersion === verificationRequestVersionRef.current) {
                    setVerificationLoading(false);
                }
            }
        };

        let intervalId: number | null = null;
        let initialTimeoutId: number | null = null;
        const isPending = verificationStatus?.status === "pending";
        const graceDelayMs = isPending
            ? Math.max(0, verificationGraceUntilRef.current - Date.now())
            : 0;

        if (graceDelayMs > 0) {
            setVerificationLoading(false);
            initialTimeoutId = window.setTimeout(() => {
                if (cancelled) return;
                void loadStatus(true);
                intervalId = window.setInterval(() => {
                    void loadStatus(false);
                }, 5000);
            }, graceDelayMs);
        } else {
            void loadStatus(true);
            if (isPending) {
                intervalId = window.setInterval(() => {
                    void loadStatus(false);
                }, 5000);
            }
        }

        return () => {
            cancelled = true;
            if (initialTimeoutId !== null) {
                window.clearTimeout(initialTimeoutId);
            }
            if (intervalId !== null) {
                window.clearInterval(intervalId);
            }
        };
    }, [authenticated, user?.id, verificationStatus?.status]);

    useEffect(() => {
        setSharedRacesPage(1);
    }, [sharedRaces]);

    useEffect(() => {
        setAccountRacePages({});
    }, [accountRaceDatasets]);

    useEffect(() => {
        if (!authenticated || !user) {
            setSharedRaceLoading(false);
            setSharedRaceError(null);
            setSharedRaces([]);
            return;
        }

        let cancelled = false;
        setSharedRaceLoading(true);
        setSharedRaceError(null);

        void (async () => {
            try {
                const response = await fetch("/api/account/shared-races", {
                    credentials: "same-origin",
                });
                if (cancelled) return;
                if (!response.ok) {
                    setSharedRaceError(await readError(response));
                    return;
                }
                const payload = await response.json() as AccountSharedRacesResponse;
                if (!cancelled) {
                    setSharedRaces(payload.races);
                }
            } catch (fetchError) {
                if (!cancelled) {
                    setSharedRaceError(fetchError instanceof Error ? fetchError.message : String(fetchError));
                }
            } finally {
                if (!cancelled) {
                    setSharedRaceLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [authenticated, user?.id]);

    useEffect(() => {
        if (!authenticated || !user) {
            setAccountRaceLoading(false);
            setAccountRaceError(null);
            setAccountRaceDatasets([]);
            setAccountRaceViewerId(null);
            return;
        }
        if (!linkedGameAccount) {
            setAccountRaceLoading(false);
            setAccountRaceError(null);
            setAccountRaceDatasets([]);
            setAccountRaceViewerId(null);
            return;
        }

        let cancelled = false;
        setAccountRaceLoading(true);
        setAccountRaceError(null);
        void (async () => {
            try {
                const response = await fetch("/api/account/races", {
                    credentials: "same-origin",
                });
                if (cancelled) return;
                if (!response.ok) {
                    setAccountRaceError(await readError(response));
                    return;
                }
                const payload = await response.json() as AccountRaceDatasetsResponse;
                if (!cancelled) {
                    setAccountRaceViewerId(payload.viewerId);
                    setAccountRaceDatasets(payload.datasets);
                }
            } catch (fetchError) {
                if (!cancelled) {
                    setAccountRaceError(fetchError instanceof Error ? fetchError.message : String(fetchError));
                }
            } finally {
                if (!cancelled) {
                    setAccountRaceLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [authenticated, user?.id, linkedGameAccount?.viewerId]);

    const pagedSharedRaces = useMemo(() => {
        const start = (sharedRacesPage - 1) * ACCOUNT_LIST_PAGE_SIZE;
        return sharedRaces.slice(start, start + ACCOUNT_LIST_PAGE_SIZE);
    }, [sharedRaces, sharedRacesPage]);

    if (!loading && !authenticated) {
        return <Navigate to={`/auth?mode=login&redirect=${redirectTarget}`} replace />;
    }

    if (loading || !user) {
        return (
            <div className="auth-shell">
                <div className="auth-panel d-flex align-items-center gap-3">
                    <Spinner animation="border" size="sm" />
                    <span>Loading account...</span>
                </div>
            </div>
        );
    }

    const getDatasetPage = (datasetKey: string) => accountRacePages[datasetKey] ?? 1;
    const getPagedDatasetRaces = (dataset: AccountRaceDatasetSummary) => {
        const page = getDatasetPage(dataset.datasetKey);
        const start = (page - 1) * ACCOUNT_LIST_PAGE_SIZE;
        return dataset.races.slice(start, start + ACCOUNT_LIST_PAGE_SIZE);
    };

    const setDatasetPage = (datasetKey: string, page: number) => {
        setAccountRacePages((previous) => ({ ...previous, [datasetKey]: page }));
        requestAnimationFrame(() => {
            datasetSectionRefs.current[datasetKey]?.scrollIntoView({ block: "start", behavior: "auto" });
        });
    };

    const setSharedRacesPageAndScroll = (page: number) => {
        setSharedRacesPage(page);
        requestAnimationFrame(() => {
            sharedRacesSectionRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
        });
    };

    const resendVerification = async () => {
        setBusy(true);
        setMessage(null);
        setError(null);
        try {
            const response = await fetch("/api/auth/resend-verification", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                },
                body: "{}",
            });
            if (!response.ok) {
                setError(await readError(response));
                return;
            }
            const payload = await response.json() as AuthMessageResponse;
            setMessage(payload.message);
        } finally {
            setBusy(false);
        }
    };

    const handleLogout = async () => {
        setBusy(true);
        await logout();
        setBusy(false);
    };

    const deleteSharedRace = async (shareKey: string) => {
        setSharedRaceBusyKey(shareKey);
        setSharedRaceError(null);
        setMessage(null);
        try {
            const response = await fetch(`/api/account/shared-races/${encodeURIComponent(shareKey)}`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            if (!response.ok) {
                setSharedRaceError(await readError(response));
                return;
            }
            setSharedRaces((previous) => previous.filter((entry) => entry.shareKey !== shareKey));
            setMessage("Shared race deleted.");
        } finally {
            setSharedRaceBusyKey(null);
        }
    };

    const openReplay = (raceUid: string, newTab = false) => {
        const href = `/racedata/${encodeURIComponent(toRaceRouteId(raceUid))}`;
        if (newTab) {
            window.open(href, "_blank", "noopener,noreferrer");
            return;
        }
        navigate(href);
    };

    const loadDatasetInMultiRace = (dataset: AccountRaceDatasetSummary) => {
        setAccountRaceImportKey(dataset.datasetKey);
        navigate(`/multirace?accountDataset=${encodeURIComponent(dataset.datasetKey)}`);
    };

    const deleteAccount = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setMessage(null);
        setError(null);
        try {
            if (deleteConfirm !== "DELETE") {
                setError("Type DELETE in all caps to confirm account deletion.");
                return;
            }
            const response = await fetch("/api/auth/delete-account", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    password: deletePassword,
                } satisfies AuthDeleteAccountRequest),
            });
            if (!response.ok) {
                setError(await readError(response));
                return;
            }
            await logout();
            setMessage("Your account has been deleted.");
        } finally {
            setBusy(false);
        }
    };

    const refreshVerificationStatus = async () => {
        const requestVersion = ++verificationRequestVersionRef.current;
        setVerificationBusy(true);
        setVerificationError(null);
        try {
            const response = await fetch("/api/account/horseact-verification/status", {
                credentials: "same-origin",
            });
            if (requestVersion !== verificationRequestVersionRef.current) {
                return;
            }
            if (!response.ok) {
                setVerificationError(await readError(response));
                return;
            }
            const payload = await response.json() as AccountHorseActVerificationStatusResponse;
            setVerificationStatus(payload);
            setVerificationError(payload.lastError);
            if (["verified", "cancelled", "expired", "failed"].includes(payload.status)) {
                setVerificationSecret(null);
            }
        } finally {
            setVerificationBusy(false);
            setVerificationLoading(false);
        }
    };

    const startVerification = async () => {
        setVerificationBusy(true);
        setVerificationError(null);
        verificationRequestVersionRef.current += 1;
        setVerificationSecret(null);
        try {
            const response = await fetch("/api/account/horseact-verification/start", {
                method: "POST",
                credentials: "same-origin",
            });
            if (!response.ok) {
                setVerificationError(await readError(response));
                return;
            }
            const payload = await response.json() as AccountHorseActVerificationStartResponse;
            setVerificationSecret(payload);
            verificationGraceUntilRef.current = Date.now() + 5000;
            setVerificationStatus((previous) => ({
                ok: true,
                status: "pending",
                expiresAt: payload.expiresAt,
                verificationId: payload.verificationId,
                lastError: null,
                linkedGameAccount: previous?.linkedGameAccount ?? null,
                veteranSnapshot: previous?.veteranSnapshot ?? {
                    available: false,
                    veteranCount: null,
                    updatedAt: null,
                },
            }));
        } finally {
            setVerificationBusy(false);
        }
    };

    const revealHorseActCredentials = async () => {
        if (verificationSecret && linkedGameAccount && verificationStatusLabel !== "pending") {
            setVerificationSecret(null);
            setVerificationError(null);
            setMessage(null);
            return;
        }
        setVerificationBusy(true);
        setVerificationError(null);
        setMessage(null);
        try {
            const response = await fetch("/api/account/horseact-verification/credentials", {
                method: "POST",
                credentials: "same-origin",
            });
            if (!response.ok) {
                setVerificationError(await readError(response));
                return;
            }
            const payload = await response.json() as AccountHorseActVerificationStartResponse;
            setVerificationSecret(payload);
        } finally {
            setVerificationBusy(false);
        }
    };

    const cancelVerification = async () => {
        setVerificationBusy(true);
        setVerificationError(null);
        verificationRequestVersionRef.current += 1;
        try {
            const response = await fetch("/api/account/horseact-verification/cancel", {
                method: "POST",
                credentials: "same-origin",
            });
            if (!response.ok) {
                setVerificationError(await readError(response));
                return;
            }
            setVerificationSecret(null);
            await refreshVerificationStatus();
        } finally {
            setVerificationBusy(false);
        }
    };

    return (
        <div className="auth-shell">
            {error ? <Alert variant="danger" className="mb-3">{error}</Alert> : null}
            {message ? <Alert variant="success" className="mb-3">{message}</Alert> : null}
            <div className="auth-grid">
                <Card className="auth-panel">
                    <Card.Body>
                        <h1>Your account</h1>
                        <div className="auth-summary-row">
                            <div className="auth-summary-label">Account name</div>
                            <div className="auth-summary-value">{user.accountName}</div>
                        </div>
                        <div className="auth-summary-row">
                            <div className="auth-summary-label">Email</div>
                            <div className="auth-summary-value">{user.email}</div>
                        </div>
                        <div className="auth-summary-row">
                            <div className="auth-summary-label">Email verified</div>
                            <div className="auth-summary-value">
                                {user.emailVerified
                                    ? <span className="account-badge account-badge--ok">Verified</span>
                                    : <span className="account-badge account-badge--warn">Unverified</span>}
                            </div>
                        </div>
                        <div className="auth-summary-row">
                            <div className="auth-summary-label">Member since</div>
                            <div className="auth-summary-value">{new Date(user.createdAt).toLocaleString()}</div>
                        </div>
                        <div className="d-flex gap-2 flex-wrap mt-4">
                            {!user.emailVerified ? (
                                <Button disabled={busy} onClick={() => void resendVerification()}>
                                    Resend verification email
                                </Button>
                            ) : null}
                            {veteranSnapshot.available ? (
                                <Link to="/veterans?mine=1" className="btn btn-outline-info">
                                    Open my veterans
                                </Link>
                            ) : null}
                            <Button variant="outline-secondary" disabled={busy} onClick={() => void handleLogout()}>
                                Log out
                            </Button>
                        </div>

                        <div className="account-danger-section">
                            <button
                                type="button"
                                className="account-danger-toggle"
                                onClick={() => setDangerOpen((o) => !o)}
                                aria-expanded={dangerOpen}
                            >
                                <span>Delete account</span>
                                <span className="account-danger-caret">{dangerOpen ? "▲" : "▼"}</span>
                            </button>
                            {dangerOpen && (
                                <div className="account-danger-body">
                                    <p className="text-secondary mb-3 account-danger-note">
                                        This permanently removes your account record, active sessions, linked game-account, veteran snapshots, and shared race uploads. Cannot be undone.
                                    </p>
                                    <Form onSubmit={deleteAccount}>
                                        <Form.Group className="mb-3">
                                            <Form.Label>Current password</Form.Label>
                                            <Form.Control
                                                type="password"
                                                autoComplete="current-password"
                                                value={deletePassword}
                                                onChange={(event) => setDeletePassword(event.target.value)}
                                                required
                                            />
                                        </Form.Group>
                                        <Form.Group className="mb-4">
                                            <Form.Label>Type DELETE to confirm</Form.Label>
                                            <Form.Control
                                                type="text"
                                                value={deleteConfirm}
                                                onChange={(event) => setDeleteConfirm(event.target.value)}
                                                required
                                            />
                                        </Form.Group>
                                        <Button type="submit" variant="outline-danger" disabled={busy}>
                                            Permanently delete account
                                        </Button>
                                    </Form>
                                </div>
                            )}
                        </div>
                    </Card.Body>
                </Card>

                <Card className="auth-panel">
                    <Card.Body>
                        <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-3">
                            <h2 className="mb-0">Game account verification</h2>
                            <Button variant="outline-info" onClick={() => setShowHorseActInstructions(true)}>
                                Instructions
                            </Button>
                        </div>
                        {verificationError ? <Alert variant="danger">{verificationError}</Alert> : null}
                        {verificationStatusLabel === "pending" && verificationStatus?.expiresAt ? (
                            <Alert variant="info">
                                Verification is pending until {new Date(verificationStatus.expiresAt).toLocaleString()}.
                            </Alert>
                        ) : null}
                        {verificationStatusLabel === "expired" ? (
                            <Alert variant="warning">
                                Your previous verification key expired. Start a fresh verification to continue.
                            </Alert>
                        ) : null}
                        {verificationStatusLabel === "cancelled" ? (
                            <Alert variant="secondary">
                                The previous verification was cancelled.
                            </Alert>
                        ) : null}
                        {verificationLoading ? (
                            <div className="d-flex align-items-center gap-2 text-secondary mb-3">
                                <Spinner animation="border" size="sm" />
                                <span>Loading verification status...</span>
                            </div>
                        ) : null}
                        {linkedGameAccount ? (
                            <div className="auth-result-panel mb-4">
                                <div className="auth-summary-row">
                                    <div className="auth-summary-label">Linked player name</div>
                                    <div className="auth-summary-value">{linkedGameAccount.playerName ?? "Unknown"}</div>
                                </div>
                                <div className="auth-summary-row">
                                    <div className="auth-summary-label">Viewer ID</div>
                                    <div className="auth-summary-value">{linkedGameAccount.viewerId}</div>
                                </div>
                                <div className="auth-summary-row">
                                    <div className="auth-summary-label">Verified</div>
                                    <div className="auth-summary-value">{new Date(linkedGameAccount.verifiedAt).toLocaleString()}</div>
                                </div>
                                <div className="auth-summary-row">
                                    <div className="auth-summary-label">Veteran snapshot</div>
                                    <div className="auth-summary-value">
                                        {veteranSnapshot.available && veteranSnapshot.veteranCount !== null
                                            ? `${veteranSnapshot.veteranCount} veterans`
                                            : "Not synced yet"}
                                    </div>
                                </div>
                                {veteranSnapshot.available && veteranSnapshot.updatedAt ? (
                                    <div className="auth-summary-row">
                                        <div className="auth-summary-label">Snapshot updated</div>
                                        <div className="auth-summary-value">{new Date(veteranSnapshot.updatedAt).toLocaleString()}</div>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                        <div className="d-flex gap-2 flex-wrap mb-3">
                            <Button disabled={verificationBusy} onClick={() => void startVerification()}>
                                {verificationBusy ? "Working..." : linkedGameAccount ? "Link different account" : "Start horseACT verification"}
                            </Button>
                            {linkedGameAccount && verificationStatusLabel !== "pending" ? (
                                <Button variant="outline-info" disabled={verificationBusy} onClick={() => void revealHorseActCredentials()}>
                                    {verificationSecret ? "Hide API key" : "View API key"}
                                </Button>
                            ) : null}
                            {verificationStatusLabel === "pending" ? (
                                <Button variant="outline-secondary" disabled={verificationBusy} onClick={() => void cancelVerification()}>
                                    Cancel pending verification
                                </Button>
                            ) : null}
                        </div>
                        {verificationSecret ? (
                            <div className="auth-code-panel">
                                <div className="auth-inline-note mb-3">
                                    {linkedGameAccount && verificationStatusLabel !== "pending"
                                        ? "These are the current horseACT credentials for your linked account."
                                        : "These credentials are shown once. If you lose them, just start a fresh verification."}
                                </div>
                                <Form.Group className="mb-3">
                                    <Form.Label>horseACT server URL</Form.Label>
                                    <Form.Control readOnly value={verificationSecret.serverUrl} className="auth-mono-value" />
                                </Form.Group>
                                <Form.Group className="mb-3">
                                    <Form.Label>horseACT API key</Form.Label>
                                    <Form.Control readOnly value={verificationSecret.apiKey} className="auth-mono-value" />
                                </Form.Group>
                                {verificationStatusLabel === "pending" ? (
                                    <div className="auth-inline-note mb-3">
                                        Expires at {new Date(verificationSecret.expiresAt).toLocaleString()}.
                                    </div>
                                ) : null}
                                {verificationStatusLabel === "pending" ? (
                                    <ol className="auth-help-list auth-instruction-list">
                                        <li>Open your <code>horseACTConfig.json</code> file.</li>
                                        <li>Set <code>serverUrl</code> to the URL above.</li>
                                        <li>Set <code>apiKey</code> to the key above.</li>
                                        <li>If you changed either value, restart the game or plugin so horseACT fetches the new config.</li>
                                        <li>Open a screen that refreshes your trained chara roster, such as the support-unit representative screen.</li>
                                        <li>Once horseACT sends that roster, this page will update automatically.</li>
                                    </ol>
                                ) : null}
                            </div>
                        ) : null}
                    </Card.Body>
                </Card>
            </div>

            <Card className="auth-panel mt-4">
                <Card.Body>
                    <div className="account-section-header">
                        <div>
                            <h2 className="mb-1">Linked race history</h2>
                            <p className="text-secondary mb-0">
                                Indexed UmaLogs races associated with your linked viewer ID
                                {accountRaceViewerId ? ` ${accountRaceViewerId}` : ""}.
                            </p>
                        </div>
                    </div>
                    {!linkedGameAccount ? (
                        <div className="text-secondary mt-3">
                            Link an in-game account to browse your recorded races here.
                        </div>
                    ) : accountRaceError ? (
                        <Alert variant="danger" className="mt-3 mb-0">{accountRaceError}</Alert>
                    ) : accountRaceLoading ? (
                        <div className="d-flex align-items-center gap-2 text-secondary mt-3">
                            <Spinner animation="border" size="sm" />
                            <span>Loading linked race history...</span>
                        </div>
                    ) : accountRaceDatasets.length === 0 ? (
                        <div className="text-secondary mt-3">
                            No indexed UmaLogs races for this linked account yet.
                        </div>
                    ) : (
                        <div className="account-dataset-list mt-3">
                            {accountRaceDatasets.map((dataset) => (
                                <div
                                    key={dataset.datasetKey}
                                    ref={(element) => { datasetSectionRefs.current[dataset.datasetKey] = element; }}
                                    className="account-dataset-card"
                                >
                                    <div className="account-dataset-head">
                                        <div>
                                            <div className="account-dataset-title">{dataset.datasetLabel}</div>
                                            <div className="account-dataset-meta">
                                                {dataset.raceCount.toLocaleString()} race(s)
                                                {dataset.latestRaceAt ? ` · Updated ${new Date(dataset.latestRaceAt).toLocaleString()}` : ""}
                                            </div>
                                        </div>
                                        <div className="account-dataset-actions">
                                            {dataset.races.length > ACCOUNT_LIST_PAGE_SIZE && (
                                                <PaginationControls
                                                    currentPage={getDatasetPage(dataset.datasetKey)}
                                                    totalItems={dataset.races.length}
                                                    pageSize={ACCOUNT_LIST_PAGE_SIZE}
                                                    showSummary={false}
                                                    className="pagination-controls--header pagination-controls--compact"
                                                    onPageChange={(page) => setDatasetPage(dataset.datasetKey, page)}
                                                />
                                            )}
                                            <button
                                                type="button"
                                                className="account-race-action-btn"
                                                disabled={accountRaceImportKey === dataset.datasetKey}
                                                onClick={() => loadDatasetInMultiRace(dataset)}
                                            >
                                                {accountRaceImportKey === dataset.datasetKey ? "Opening…" : "Load in Multi-race"}
                                            </button>
                                        </div>
                                    </div>
                                    <div key={`${dataset.datasetKey}:${getDatasetPage(dataset.datasetKey)}`} className="d-flex flex-column gap-3">
                                        {getPagedDatasetRaces(dataset).map((race) => (
                                            <div key={getParticipatedRaceKey(race)} className="account-race-card">
                                                <div className="account-race-card-head">
                                                    <div>
                                                        <div
                                                            className={`account-race-card-label ${race.participant.finishOrder === 1 ? "account-race-card-label--win" : "account-race-card-label--loss"}`}
                                                        >
                                                            {formatParticipatedRaceLabel(race)}
                                                            <span className="account-race-card-date">{new Date(race.ingestedAt).toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                    <div className="account-race-card-actions-wrap">
                                                        <div className="account-race-card-actions">
                                                            <button
                                                                type="button"
                                                                className="account-race-action-btn"
                                                                onClick={() => openReplay(race.raceUid)}
                                                            >
                                                                Open replay
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="account-race-action-btn"
                                                                onClick={() => openReplay(race.raceUid, true)}
                                                            >
                                                                New tab
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                                <AccountReplayLineup race={race} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card.Body>
            </Card>

            <Card className="auth-panel mt-4">
                <Card.Body>
                    <div ref={sharedRacesSectionRef} className="account-section-header">
                        <div>
                            <h2>Saved shared races</h2>
                            <p className="text-secondary mb-3">
                                Races you share while logged in stay here until you delete them.
                            </p>
                        </div>
                        {sharedRaces.length > ACCOUNT_LIST_PAGE_SIZE && (
                            <PaginationControls
                                currentPage={sharedRacesPage}
                                totalItems={sharedRaces.length}
                                pageSize={ACCOUNT_LIST_PAGE_SIZE}
                                showSummary={false}
                                className="pagination-controls--header pagination-controls--compact"
                                onPageChange={setSharedRacesPageAndScroll}
                            />
                        )}
                    </div>
                    {sharedRaceError ? <Alert variant="danger">{sharedRaceError}</Alert> : null}
                    {sharedRaceLoading ? (
                        <div className="d-flex align-items-center gap-2 text-secondary">
                            <Spinner animation="border" size="sm" />
                            <span>Loading shared races...</span>
                        </div>
                    ) : sharedRaces.length === 0 ? (
                        <div className="text-secondary">
                            No saved shared races yet.
                        </div>
                    ) : (
                        <div className="d-flex flex-column gap-3">
                            {pagedSharedRaces.map((entry) => (
                                <div key={entry.shareKey} className="account-race-card">
                                    <div className="account-race-card-head">
                                        <span className="account-race-card-label">Shared race</span>
                                        <span className="account-race-card-date">
                                            {new Date(entry.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                                        </span>
                                    </div>
                                    <SharedRaceLineup shareKey={entry.shareKey} />
                                    <div className="account-race-card-footer">
                                        <span className="account-race-card-meta">
                                            {entry.lastAccessedAt
                                                ? <>Last opened {new Date(entry.lastAccessedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</>
                                                : "Not opened yet"}
                                        </span>
                                        <span className="account-race-card-actions">
                                            <button
                                                className="account-race-action-btn"
                                                onClick={() => window.open(entry.shareUrl, "_blank", "noopener,noreferrer")}
                                                title="Open in new tab"
                                            >
                                                Open ↗
                                            </button>
                                            <button
                                                className="account-race-action-btn"
                                                onClick={() => {
                                                    void navigator.clipboard.writeText(entry.shareUrl);
                                                    setMessage("Shared race link copied.");
                                                }}
                                                title="Copy share link"
                                            >
                                                Copy link
                                            </button>
                                            <button
                                                className="account-race-action-btn account-race-action-btn--danger"
                                                disabled={sharedRaceBusyKey === entry.shareKey}
                                                onClick={() => void deleteSharedRace(entry.shareKey)}
                                            >
                                                {sharedRaceBusyKey === entry.shareKey ? "Deleting…" : "Delete"}
                                            </button>
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card.Body>
            </Card>

            <Modal show={showHorseActInstructions} onHide={() => setShowHorseActInstructions(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title>horseACT instructions</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <ol className="auth-help-list auth-instruction-list mb-0">
                        <li>
                            Head to <a href="https://github.com/ayaliz/horseACT" target="_blank" rel="noreferrer">https://github.com/ayaliz/horseACT</a>.
                        </li>
                        <li>Follow the instructions there to install the plugin.</li>
                        <li>Open your <code>horseACTConfig.json</code> file.</li>
                        <li>Change the <code>serverUrl</code> and <code>apiKey</code> fields to the values provided on this page.</li>
                        <li>Restart the game.</li>
                        <li>Head to your veteran list to verify.</li>
                    </ol>
                </Modal.Body>
            </Modal>
        </div>
    );
}
