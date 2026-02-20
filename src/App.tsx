import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Container, Nav, Navbar, Spinner } from "react-bootstrap";
import { HashRouter, Link, Route, Routes } from "react-router-dom";
import './App.css';
import './dark-mode.css';
import UMDatabaseWrapper from './data/UMDatabaseWrapper';
import GameDataLoader from './data/GameDataLoader';

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
const MasterDataPage  = lazyWithReload(() => import("./pages/MasterDataPage"),  "MasterDataPage");
const NotesPage       = lazyWithReload(() => import("./pages/NotesPage"),       "NotesPage");
const SetupGuidePage  = lazyWithReload(() => import("./pages/SetupGuidePage"),  "SetupGuidePage");
const VeteransPage    = lazyWithReload(() => import("./pages/VeteransPage"),    "VeteransPage");


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

    return <HashRouter>
        <Navbar className="haku-nav" variant="dark" expand="lg">
            <Container>
                <Navbar.Brand as={Link} to="/">Hakuraku</Navbar.Brand>
                <Navbar.Toggle aria-controls="basic-navbar-nav" />

                <Navbar.Collapse id="basic-navbar-nav">
                    <Nav className="me-auto">
                        <Nav.Link as={Link} to="/">Home</Nav.Link>
                        <Nav.Link as={Link} to="/veterans">Veterans</Nav.Link>
                        <Nav.Link as={Link} to="/racedata">Race Analysis</Nav.Link>
                        <Nav.Link as={Link} to="/multirace">Multi-Race Analysis</Nav.Link>
                        <Nav.Link as={Link} to="/masterdata">Master Data</Nav.Link>
                        <Nav.Link as={Link} to="/notes">Research Notes</Nav.Link>
                    </Nav>
                    <Nav className="ms-auto">
                        <Nav.Link as={Link} to="/setup">Setup Guide</Nav.Link>
                    </Nav>
                </Navbar.Collapse>
            </Container>
        </Navbar>

        <Container>
            <Suspense fallback={<div className="p-4 text-center"><Spinner animation="border" /></div>}>
                <Routes>
                    <Route path="/veterans" element={<VeteransPage />} />
                    <Route path="/racedata" element={<RaceDataPage />} />
                    <Route path="/multirace" element={<MultiRacePage />} />
                    <Route path="/setup" element={<SetupGuidePage />} />
                    <Route path="/masterdata" element={<MasterDataPage />} />
                    <Route path="/notes/:noteId" element={<NotesPage />} />
                    <Route path="/notes" element={<NotesPage />} />
                    <Route path="/" element={<Home />} />
                </Routes>
            </Suspense>
        </Container>
    </HashRouter>;
}

function Home() {
    return (
        <div style={{ maxWidth: 900, margin: '32px auto' }}>
            <div style={{ borderRadius: 12, boxShadow: 'var(--haku-shadow-lg)', overflow: 'hidden' }}>
                <img src={import.meta.env.BASE_URL + 'assets/sky.webp'} alt="Sky" style={{ width: '100%', display: 'block' }} />
            </div>
        </div>
    );
}

