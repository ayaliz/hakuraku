import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Container, Nav, Navbar, Spinner } from "react-bootstrap";
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import './App.css';
import './dark-mode.css';
import UMDatabaseWrapper from './data/UMDatabaseWrapper';
import GameDataLoader from './data/GameDataLoader';
import { AuthProvider, useAuth } from "./auth/AuthContext";

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
const AuthPage        = lazyWithReload(() => import("./pages/AuthPage"),        "AuthPage");
const AccountPage     = lazyWithReload(() => import("./pages/AccountPage"),     "AccountPage");
const PrivacyPolicyPage = lazyWithReload(() => import("./pages/PrivacyPolicyPage"), "PrivacyPolicyPage");

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

    useEffect(() => {
        Promise.all([
            UMDatabaseWrapper.initialize(),
            GameDataLoader.initialize(),
        ]).then(() => setUmdbLoaded(true))
            .catch(err => console.error("Failed to initialize data loaders:", err));
    }, []);

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
                                <span className="haku-nav-badge">CM12 update!</span>
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
                    <Route path="/veterans" element={<VeteransPage />} />
                    <Route path="/racedata/:raceUid" element={<RaceDataPage />} />
                    <Route path="/racedata" element={<RaceDataPage />} />
                    <Route path="/multirace" element={<MultiRacePage />} />
                    <Route path="/umalogs" element={<UmaLogsPage />} />
                    <Route path="/setup" element={<SetupGuidePage />} />
                    <Route path="/masterdata" element={<MasterDataPage />} />
                    <Route path="/notes/:noteId" element={<NotesPage />} />
                    <Route path="/notes" element={<NotesPage />} />
                    <Route path="/shop-refresh" element={<ShopRefreshPage />} />
                    <Route path="/auth" element={<AuthPage />} />
                    <Route path="/account" element={<AccountPage />} />
                    <Route path="/accounts" element={<AccountPage />} />
                    <Route path="/privacy" element={<PrivacyPolicyPage />} />
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
            <div className="home-promo-card">
                <img src={import.meta.env.BASE_URL + 'assets/sky.webp'} alt="Sky" className="home-promo-img" />
            </div>
        </div>
    );
}
