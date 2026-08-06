import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Alert, Container, Nav, Navbar, Spinner } from "react-bootstrap";
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import './App.css';
import './dark-mode.css';
import UMDatabaseWrapper from './data/UMDatabaseWrapper';
import GameDataLoader from './data/GameDataLoader';
import { AuthProvider, useAuth } from "./auth/AuthContext";
import PageMeta from "./components/PageMeta";
import type { Manifest, ManifestEntry } from "./pages/UmaLogsPage/umaLogsTypes";

// Wraps lazy() to auto-reload once on chunk load failure (stale deploy hash mismatch).
function lazyWithReload<T extends React.ComponentType<any>>(
    factory: () => Promise<{ default: T }>,
    name: string
) {
    return lazy(() =>
        factory().catch(() => {
            const key = `chunk-reload:${name}`;
            if (!sessionStorage.getItem(key)) {
                sessionStorage.setItem(key, '1');
                window.location.reload();
            }
            return new Promise<{ default: T }>(() => {});
        })
    );
}

const RaceDataPage    = lazyWithReload(() => import("./pages/RaceDataPage"),    "RaceDataPage");
const MultiRacePage   = lazyWithReload(() => import("./pages/MultiRacePage"),   "MultiRacePage");
const UmaLogsPage     = lazyWithReload(() => import("./pages/UmaLogsPage"),     "UmaLogsPage");
const MasterDataPage  = lazyWithReload(() => import("./pages/MasterDataPage"),  "MasterDataPage");
const NotesPage       = lazyWithReload(() => import("./pages/NotesPage"),       "NotesPage");
const SetupGuidePage  = lazyWithReload(() => import("./pages/SetupGuidePage"),  "SetupGuidePage");
const VeteransPage      = lazyWithReload(() => import("./pages/VeteransPage"),      "VeteransPage");
const ShopRefreshPage   = lazyWithReload(() => import("./pages/ShopRefreshPage"),  "ShopRefreshPage");
const InheritanceFactorsPage = lazyWithReload(() => import("./pages/InheritanceFactorsPage"), "InheritanceFactorsPage");
const AuthPage        = lazyWithReload(() => import("./pages/AuthPage"),        "AuthPage");
const AccountPage     = lazyWithReload(() => import("./pages/AccountPage"),     "AccountPage");
const PrivacyPolicyPage = lazyWithReload(() => import("./pages/PrivacyPolicyPage"), "PrivacyPolicyPage");
const rawUmaLogsApiBase = (import.meta.env.VITE_UMALOGS_API_BASE ?? "").trim();
const UMA_LOGS_API_BASE = rawUmaLogsApiBase === "same-origin"
    ? ""
    : rawUmaLogsApiBase.replace(/\/$/, "");

function getLatestCmDatasetLabel(datasets: ManifestEntry[]): string | null {
    const cmDatasets = datasets
        .map((dataset, index) => {
            const label = dataset.cmLabel || dataset.cmId.toUpperCase();
            const match = label.match(/^CM(\d+)$/i) ?? dataset.cmId.match(/^cm(\d+)$/i);
            return match ? {
                index,
                label: `CM${Number(match[1])}`,
                number: Number(match[1]),
            } : null;
        })
        .filter((dataset): dataset is { index: number; label: string; number: number } => dataset !== null);

    if (cmDatasets.length === 0) return null;
    return cmDatasets.sort((a, b) => b.number - a.number || b.index - a.index)[0].label;
}

// Search-result copy for each route. Kept together so the titles and descriptions can be read
// side by side; they compete with each other in results, so they need to stay distinct.
const PAGE_META: Record<string, { title: string; description?: string; noIndex?: boolean }> = {
    veterans: {
        title: "Veterans",
        description: "Browse veteran Umamusume race entries and their training, stats, skills and results.",
    },
    racedata: {
        title: "Race Analysis",
        description: "Replay an Umamusume race frame by frame: last spurt speeds, skill activations and durations, HP drain, position keep and blocking.",
    },
    multirace: {
        title: "Multi-Race Analysis",
        description: "Analyse many Umamusume races at once to find patterns in spurt success, skill activation rates and running style matchups.",
    },
    umalogs: {
        title: "UmaLogs",
        description: "Champions Meeting race archives and aggregate statistics from collected Umamusume race data.",
    },
    setup: {
        title: "Setup Guide",
        description: "How to capture your own Umamusume race data and load it into Hakuraku for analysis.",
    },
    masterdata: {
        title: "Master Data",
        description: "Search the Umamusume master database: skills, characters, support cards, races and their raw effect values.",
    },
    notes: {
        title: "Research Notes",
        description: "Write-ups on Umamusume race mechanics: speed formulas, skill scaling, stamina and last spurt behaviour.",
    },
    shopRefresh: {
        title: "Shop Refresh",
        description: "Crowdsourced Umamusume shop refresh data.",
    },
    inheritanceFactors: {
        title: "Inheritance Factors",
        description: "Umamusume inheritance factor data and spark analysis.",
    },
    auth: { title: "Log In", noIndex: true },
    account: { title: "Account", noIndex: true },
    privacy: { title: "Privacy Policy", description: "How Hakuraku handles your data." },
};

function withMeta(meta: { title: string; description?: string; noIndex?: boolean }, element: React.ReactNode) {
    return <><PageMeta {...meta} />{element}</>;
}

function FooterMailIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3.5 5.5h13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" />
            <path d="m4 6 6 4.5L16 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function FooterPrivacyIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 2.5c2.1 1.7 4.25 2.54 6.5 2.5v4.56c0 3.74-2.3 6.03-6.5 7.94-4.2-1.91-6.5-4.2-6.5-7.94V5c2.25.04 4.4-.8 6.5-2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M7.6 9.3V8.2a2.4 2.4 0 0 1 4.8 0v1.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <rect x="6.3" y="9.3" width="7.4" height="5.2" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
    );
}

export default function App() {
    const [umdbLoaded, setUmdbLoaded] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        Promise.all([
            UMDatabaseWrapper.initialize(),
            GameDataLoader.initialize(),
        ]).then(() => {
            if (!cancelled) {
                setUmdbLoaded(true);
            }
        }).catch(err => {
            console.error("Failed to initialize data loaders:", err);
            if (!cancelled) {
                setLoadError(err instanceof Error ? err.message : "Failed to initialize local data files.");
            }
        });

        return () => {
            cancelled = true;
        };
    }, []);

    if (loadError) {
        return (
            <Container className="py-5">
                <Alert variant="danger">
                    <Alert.Heading>Failed to load local game data</Alert.Heading>
                    <p className="mb-2">{loadError}</p>
                    <p className="mb-0">
                        Make sure the repository includes the required files in
                        <code> public/data/</code>, especially
                        <code> umdb.binarypb.gz</code> and
                        <code> gamedata.bin.gz</code>.
                    </p>
                </Alert>
            </Container>
        );
    }

    if (!umdbLoaded) {
        return <div><Spinner animation="border" /> Loading UMDatabase...</div>;
    }

    return <BrowserRouter>
        <AuthProvider>
            <AppShell />
        </AuthProvider>
    </BrowserRouter>;
}

function AppShell() {
    const { loading, authenticated, user } = useAuth();
    const [umaLogsBadgeLabel, setUmaLogsBadgeLabel] = useState("CM12 update!");

    useEffect(() => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 5000);
        fetch(`${UMA_LOGS_API_BASE}/api/umalogs/manifest`, { signal: controller.signal })
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status} - manifest not found`);
                return r.json() as Promise<Manifest>;
            })
            .then((manifest) => {
                const latestLabel = getLatestCmDatasetLabel(manifest.datasets);
                if (latestLabel) setUmaLogsBadgeLabel(`${latestLabel} update!`);
            })
            .catch((error: Error) => {
                if (error.name !== "AbortError") {
                    console.warn("Failed to load UmaLogs manifest for navbar badge:", error);
                }
            });

        return () => {
            window.clearTimeout(timeoutId);
            controller.abort();
        };
    }, []);

    return <>
        <Navbar className="haku-nav" variant="dark" expand="lg">
            <Container>
                <Navbar.Brand as={Link} to="/">Hakuraku</Navbar.Brand>
                <Navbar.Toggle aria-controls="basic-navbar-nav" />

                <Navbar.Collapse id="basic-navbar-nav">
                    <Nav className="me-auto">
                        <Nav.Link as={NavLink} to="/" end>Home</Nav.Link>
                        <Nav.Link as={NavLink} to="/veterans">Veterans</Nav.Link>
                        <Nav.Link as={NavLink} to="/racedata">Race Analysis</Nav.Link>
                        <Nav.Link as={NavLink} to="/multirace">Multi-Race Analysis</Nav.Link>
                        <Nav.Link as={NavLink} to="/masterdata">Master Data</Nav.Link>
                        <Nav.Link as={NavLink} to="/notes">Research Notes</Nav.Link>
                        <Nav.Link as={NavLink} to="/umalogs">
                            <span className="haku-nav-link-with-badge">
                                <span>UmaLogs</span>
                                <span className="haku-nav-badge">{umaLogsBadgeLabel}</span>
                            </span>
                        </Nav.Link>
                    </Nav>
                    <Nav className="ms-auto align-items-lg-center">
                        {loading ? (
                            <Nav.Link disabled>Account</Nav.Link>
                        ) : authenticated && user ? (
                            <Nav.Link as={NavLink} to="/account">{user.accountName}</Nav.Link>
                        ) : (
                            <>
                                <Nav.Link as={NavLink} to="/auth?mode=register">Register</Nav.Link>
                                <Nav.Link as={NavLink} to="/auth">Log in</Nav.Link>
                            </>
                        )}
                    </Nav>
                </Navbar.Collapse>
            </Container>
        </Navbar>

        <Container>
            <Suspense fallback={<div className="p-4 text-center"><Spinner animation="border" /></div>}>
                <Routes>
                    <Route path="/veterans" element={withMeta(PAGE_META.veterans, <VeteransPage />)} />
                    <Route path="/racedata/:raceUid" element={withMeta(PAGE_META.racedata, <RaceDataPage />)} />
                    <Route path="/racedata" element={withMeta(PAGE_META.racedata, <RaceDataPage />)} />
                    <Route path="/multirace" element={withMeta(PAGE_META.multirace, <MultiRacePage />)} />
                    <Route path="/umalogs" element={withMeta(PAGE_META.umalogs, <UmaLogsPage />)} />
                    <Route path="/setup" element={withMeta(PAGE_META.setup, <SetupGuidePage />)} />
                    <Route path="/masterdata" element={withMeta(PAGE_META.masterdata, <MasterDataPage />)} />
                    <Route path="/notes/:noteId" element={withMeta(PAGE_META.notes, <NotesPage />)} />
                    <Route path="/notes" element={withMeta(PAGE_META.notes, <NotesPage />)} />
                    <Route path="/shop-refresh" element={withMeta(PAGE_META.shopRefresh, <ShopRefreshPage />)} />
                    <Route path="/inheritance-factors" element={withMeta(PAGE_META.inheritanceFactors, <InheritanceFactorsPage />)} />
                    <Route path="/auth" element={withMeta(PAGE_META.auth, <AuthPage />)} />
                    <Route path="/account" element={withMeta(PAGE_META.account, <AccountPage />)} />
                    <Route path="/accounts" element={withMeta(PAGE_META.account, <AccountPage />)} />
                    <Route path="/privacy" element={withMeta(PAGE_META.privacy, <PrivacyPolicyPage />)} />
                    <Route path="/" element={<Home />} />
                </Routes>
            </Suspense>
        </Container>

        <footer className="haku-footer">
            <Container className="haku-footer-inner">
                <div className="haku-footer-links">
                    <Link to="/privacy" className="haku-footer-link haku-footer-link--text">
                        <span className="haku-footer-inline-icon"><FooterPrivacyIcon /></span>
                        <span>Privacy Policy</span>
                    </Link>
                    <a href="mailto:contact@hakuraku.moe" className="haku-footer-link haku-footer-link--text">
                        <span className="haku-footer-inline-icon"><FooterMailIcon /></span>
                        <span>contact@hakuraku.moe</span>
                    </a>
                    <a
                        href="https://www.patreon.com/hakuraku"
                        target="_blank"
                        rel="noreferrer"
                        className="haku-footer-link"
                    >
                        <img
                            src={import.meta.env.BASE_URL + 'assets/other/patreon.webp'}
                            alt=""
                            className="haku-footer-brand-icon"
                        />
                        <span>Patreon</span>
                    </a>
                    <a
                        href="https://github.com/ayaliz/hakuraku/"
                        target="_blank"
                        rel="noreferrer"
                        className="haku-footer-link"
                    >
                        <img
                            src={import.meta.env.BASE_URL + 'assets/other/github.webp'}
                            alt=""
                            className="haku-footer-brand-icon"
                        />
                        <span>GitHub</span>
                    </a>
                    <a
                        href="https://discord.com/invite/q38jC7q2Hs"
                        target="_blank"
                        rel="noreferrer"
                        className="haku-footer-link"
                    >
                        <img
                            src={import.meta.env.BASE_URL + 'assets/other/discord.webp'}
                            alt=""
                            className="haku-footer-brand-icon"
                        />
                        <span>Discord</span>
                    </a>
                </div>
                <div className="haku-footer-disclaimer">
                    This website is not affiliated with Cygames, Inc.
                </div>
            </Container>
        </footer>
    </>;
}

function Home() {
    return (
        <div className="home-promo">
            <PageMeta
                title="Hakuraku"
                appendSiteName={false}
                description="Umamusume race analysis and room match data"
            />
            <div className="home-promo-card">
                <img src={import.meta.env.BASE_URL + 'assets/sky.webp'} alt="Sky" className="home-promo-img" />
            </div>
        </div>
    );
}
