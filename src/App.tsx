import React, { useEffect, useState } from 'react';
import { Alert, Container, Nav, Navbar, NavDropdown, Spinner } from "react-bootstrap";
import 'react-bootstrap-table-next/dist/react-bootstrap-table2.css';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import { HashRouter, Link, Route, Switch } from "react-router-dom";
import './App.css';
import './dark-mode.css';
import UMDatabaseWrapper from './data/UMDatabaseWrapper';
import GameDataLoader from './data/GameDataLoader';
import RaceDataPage from "./pages/RaceDataPage";
import RaceDataPageOld from "./pages/RaceDataPage_old";
import MultiRacePage from "./pages/MultiRacePage";
import StoriesPage from "./pages/StoriesPage";
import SuccessionPage from './pages/SuccessionPage';
import SuccessionRelationsPage from "./pages/SuccessionRelationsPage";
import SetupGuidePage from './pages/SetupGuidePage';
import VeteransPage from './pages/VeteransPage';
import MasterDataPage from './pages/MasterDataPage';


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
        <Navbar bg="dark" variant="dark" expand="lg">
            <Container>
                <Navbar.Brand as={Link} to="/">Hakuraku</Navbar.Brand>
                <Navbar.Toggle aria-controls="basic-navbar-nav" />

                <Navbar.Collapse id="basic-navbar-nav">
                    <Nav className="mr-auto">
                        <Nav.Link as={Link} to="/">Home</Nav.Link>
                        <Nav.Link as={Link} to="/veterans">Veterans</Nav.Link>
                        <Nav.Link as={Link} to="/masterdata">Master Data</Nav.Link>
                        <NavDropdown title="Race Analysis" id="race-analysis-nav-dropdown">
                            <NavDropdown.Item as={Link} to="/racedata">
                                Parse races
                            </NavDropdown.Item>
                            <NavDropdown.Item as={Link} to="/multirace">
                                Multi-Race Analysis
                            </NavDropdown.Item>
                            <NavDropdown.Divider />
                            <NavDropdown.Item as={Link} to="/racedata_old">
                                Parse races [old]
                            </NavDropdown.Item>
                        </NavDropdown>
                    </Nav>
                    <Nav className="ml-auto">
                        <Nav.Link as={Link} to="/setup">How to get my race data <small style={{ color: 'red' }}>(Jan 13 update!)</small></Nav.Link>

                    </Nav>
                </Navbar.Collapse>
            </Container>
        </Navbar>

        <Container>
            <Switch>
                <Route path="/veterans">
                    <VeteransPage />
                </Route>
                <Route path="/succession">
                    <SuccessionPage />
                </Route>
                <Route path="/successionrelations">
                    <SuccessionRelationsPage />
                </Route>
                <Route path="/stories">
                    <StoriesPage />
                </Route>
                <Route path="/racedata">
                    <RaceDataPage />
                </Route>
                <Route path="/racedata_old">
                    <RaceDataPageOld />
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
                <Route path="/">
                    <Home />
                </Route>
            </Switch>
        </Container>
    </HashRouter>;
}

function Home() {
    return <Alert variant="primary">Nothing here yet</Alert>;
}

