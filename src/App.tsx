import React, { useEffect, useState } from 'react';
import { Container, Nav, Navbar, Spinner } from "react-bootstrap";
import 'react-bootstrap-table-next/dist/react-bootstrap-table2.css';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import { HashRouter, Link, Route, Routes } from "react-router-dom";
import './App.css';
import './dark-mode.css';
import UMDatabaseWrapper from './data/UMDatabaseWrapper';
import GameDataLoader from './data/GameDataLoader';
import RaceDataPage from "./pages/RaceDataPage";
import MultiRacePage from "./pages/MultiRacePage";
import SetupGuidePage from './pages/SetupGuidePage';
import VeteransPage from './pages/VeteransPage';
import MasterDataPage from './pages/MasterDataPage';
import NotesPage from './pages/NotesPage';
import RaceDataPageOld from './pages/RaceDataPage_old';


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
                        <Nav.Link as={Link} to="/masterdata">Master Data</Nav.Link>
                        <Nav.Link as={Link} to="/racedata">Race Analysis</Nav.Link>
                        <Nav.Link as={Link} to="/multirace">Multi-Race Analysis</Nav.Link>
                        <Nav.Link as={Link} to="/racedata_old">Parse races [old]</Nav.Link>
                        <Nav.Link as={Link} to="/notes">Research Notes</Nav.Link>
                    </Nav>
                    <Nav className="ms-auto">
                        <Nav.Link as={Link} to="/setup">Setup Guide</Nav.Link>
                    </Nav>
                </Navbar.Collapse>
            </Container>
        </Navbar>

        <Container>
            <Routes>
                <Route path="/veterans" element={<VeteransPage />} />
                <Route path="/racedata_old" element={<RaceDataPageOld />} />
                <Route path="/racedata" element={<RaceDataPage />} />
                <Route path="/multirace" element={<MultiRacePage />} />
                <Route path="/setup" element={<SetupGuidePage />} />
                <Route path="/masterdata" element={<MasterDataPage />} />
                <Route path="/notes/:noteId" element={<NotesPage />} />
                <Route path="/notes" element={<NotesPage />} />
                <Route path="/" element={<Home />} />
            </Routes>
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

