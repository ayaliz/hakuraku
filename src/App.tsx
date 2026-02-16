import React, { useEffect, useState } from 'react';
import { Container, Nav, Navbar, Spinner } from "react-bootstrap";
import 'react-bootstrap-table-next/dist/react-bootstrap-table2.css';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import { HashRouter, Link, Route, Switch } from "react-router-dom";
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
                    <Nav className="mr-auto">
                        <Nav.Link as={Link} to="/">Home</Nav.Link>
                        <Nav.Link as={Link} to="/veterans">Veterans</Nav.Link>
                        <Nav.Link as={Link} to="/masterdata">Master Data</Nav.Link>
                        <Nav.Link as={Link} to="/racedata">Race Analysis</Nav.Link>
                        <Nav.Link as={Link} to="/multirace">Multi-Race Analysis</Nav.Link>
                        <Nav.Link as={Link} to="/notes">Research Notes</Nav.Link>
                    </Nav>
                    <Nav className="ml-auto">
                        <Nav.Link as={Link} to="/setup">Setup Guide</Nav.Link>
                    </Nav>
                </Navbar.Collapse>
            </Container>
        </Navbar>

        <Container>
            <Switch>
                <Route path="/veterans">
                    <VeteransPage />
                </Route>
                <Route path="/racedata">
                    <RaceDataPage />
                </Route>
                <Route path="/multirace">
                    <MultiRacePage />
                </Route>
                <Route path="/setup">
                    <SetupGuidePage />
                </Route>
                <Route path="/masterdata">
                    <MasterDataPage />
                </Route>
                <Route path="/notes">
                    <NotesPage />
                </Route>
                <Route path="/">
                    <Home />
                </Route>
            </Switch>
        </Container>
    </HashRouter>;
}

function Home() {
    return (
        <div style={{ maxWidth: 900, margin: '32px auto' }}>
            <div style={{ borderRadius: 12, boxShadow: 'var(--haku-shadow-lg)', overflow: 'hidden' }}>
                <img src={process.env.PUBLIC_URL + '/assets/sky.webp'} alt="Sky" style={{ width: '100%', display: 'block' }} />
            </div>
        </div>
    );
}

