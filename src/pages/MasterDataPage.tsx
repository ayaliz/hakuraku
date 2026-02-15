import React, { useState, useEffect, useRef } from 'react';
import { Alert, Button, Col, Container, Row, Spinner, Tab, Tabs } from 'react-bootstrap';
import pako from 'pako';
import initSqlJs, { Database, QueryExecResult } from 'sql.js';
import { useLocation } from 'react-router-dom';

let cachedDb: Database | null = null;

const isDateColumn = (col: string) => col.endsWith('_date');
const formatUnixTimestamp = (ts: number) =>
    new Date(ts * 1000).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

interface VersionEntry {
    hash: string;
    short_hash: string;
    date: string;
    previous_hash: string | null;
    summary: DiffSummary | null;
}

interface DiffSummary {
    tables_changed: number;
    added: number;
    removed: number;
    modified: number;
}

interface TableDiff {
    columns: string[];
    added: any[][];
    removed: any[][];
    modified: Array<{ key: any; before: any[]; after: any[] }>;
}

interface DiffData {
    from_hash: string;
    to_hash: string;
    date: string;
    summary: DiffSummary;
    tables: Record<string, TableDiff>;
}

function SqlBrowserTab() {
    const location = useLocation();
    const queryParam = new URLSearchParams(location.search).get('q') ?? '';

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tableList, setTableList] = useState<string[]>([]);
    const [sql, setSql] = useState(queryParam);
    const [results, setResults] = useState<QueryExecResult[] | null>(null);
    const [queryError, setQueryError] = useState<string | null>(null);
    const [dbLoaded, setDbLoaded] = useState(!!cachedDb);
    const [copied, setCopied] = useState(false);
    const [crossRef, setCrossRef] = useState<{ column: string; tables: string[] } | null>(null);
    const [filterText, setFilterText] = useState('');
    const [tableSearch, setTableSearch] = useState('');

    const executeQuery = (db: Database, sqlStr: string) => {
        setCrossRef(null);
        setFilterText('');
        setQueryError(null);
        try {
            const stmt = db.prepare(sqlStr);
            try {
                const columns = stmt.getColumnNames();
                const values: QueryExecResult['values'] = [];
                while (stmt.step()) {
                    values.push(stmt.get());
                }
                setResults(columns.length > 0 || values.length > 0 ? [{ columns, values }] : []);
            } finally {
                stmt.free();
            }
        } catch (e: any) {
            setQueryError(String(e));
            setResults(null);
        }
    };

    const loadDatabase = async (autoRunQuery?: string) => {
        if (cachedDb) {
            populateTables(cachedDb);
            setDbLoaded(true);
            if (autoRunQuery) executeQuery(cachedDb, autoRunQuery);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const SQL = await initSqlJs({
                locateFile: () => process.env.PUBLIC_URL + '/sql-wasm.wasm',
            });
            const resp = await fetch(process.env.PUBLIC_URL + '/data/masterdata/master.mdb.gz');
            if (!resp.ok) throw new Error(`Failed to fetch master.mdb.gz: ${resp.status}`);
            const compressed = new Uint8Array(await resp.arrayBuffer());
            const decompressed = pako.inflate(compressed);
            cachedDb = new SQL.Database(decompressed);
            populateTables(cachedDb);
            setDbLoaded(true);
            if (autoRunQuery) executeQuery(cachedDb, autoRunQuery);
        } catch (e: any) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (queryParam) loadDatabase(queryParam);
    }, []);

    const populateTables = (db: Database) => {
        const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
        if (res.length > 0) {
            const tables = res[0].values.map((r) => String(r[0]));
            const nonEmpty = tables.filter(t => db.exec(`SELECT 1 FROM "${t}" LIMIT 1`).length > 0);
            setTableList(nonEmpty);
        }
    };

    const handleTableClick = (table: string) => {
        const q = `SELECT * FROM "${table}" LIMIT 100`;
        setSql(q);
        setQueryError(null);
        if (cachedDb) executeQuery(cachedDb, q);
    };

    const runQuery = () => {
        if (!cachedDb) return;
        executeQuery(cachedDb, sql);
    };

    const handleColumnClick = (columnName: string) => {
        if (!cachedDb) return;
        const tablesRes = cachedDb.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
        if (tablesRes.length === 0) { setCrossRef({ column: columnName, tables: [] }); return; }
        const allTables = tablesRes[0].values.map(r => String(r[0]));
        const matching = allTables.filter(t => {
            const info = cachedDb!.exec(`PRAGMA table_info("${t}")`);
            return info.length > 0 && info[0].values.some(row => String(row[1]) === columnName);
        });
        setCrossRef({ column: columnName, tables: matching });
    };

    const copyShareLink = () => {
        const base = window.location.href.split('#')[0];
        const url = `${base}#/masterdata?q=${encodeURIComponent(sql)}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="mt-3">
            {!dbLoaded && (
                <div className="mb-3">
                    <Button variant="primary" onClick={() => loadDatabase()} disabled={loading}>
                        {loading ? <><Spinner animation="border" size="sm" /> Loading...</> : 'Load Database'}
                    </Button>
                </div>
            )}
            {error && <Alert variant="danger">{error}</Alert>}

            {dbLoaded && (
                <Row>
                    <Col md={3} style={{ maxHeight: '70vh', overflowY: 'auto', borderRight: '1px solid #444' }}>
                        <div className="mb-2 d-flex align-items-center" style={{ gap: 6 }}>
                            <strong>Tables</strong>
                            <input
                                type="text"
                                className="form-control form-control-sm"
                                placeholder="Search..."
                                value={tableSearch}
                                onChange={(e) => setTableSearch(e.target.value)}
                                style={{ flex: 1 }}
                            />
                        </div>
                        {tableList
                            .filter(t => !tableSearch || t.toLowerCase().includes(tableSearch.toLowerCase()))
                            .map((t) => (
                                <div
                                    key={t}
                                    onClick={() => handleTableClick(t)}
                                    style={{ cursor: 'pointer', padding: '2px 4px', fontSize: '0.85rem' }}
                                    className="table-row-hover"
                                >
                                    {t}
                                </div>
                            ))
                        }
                    </Col>
                    <Col md={9}>
                        <textarea
                            className="form-control mb-2"
                            rows={4}
                            value={sql}
                            onChange={(e) => setSql(e.target.value)}
                            placeholder="SELECT * FROM table_name LIMIT 100"
                            style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
                        />
                        <Button variant="success" onClick={runQuery} disabled={!sql.trim()}>
                            Run Query
                        </Button>
                        {' '}
                        <Button variant="outline-secondary" onClick={copyShareLink} disabled={!sql.trim()}>
                            {copied ? 'Copied!' : 'Share'}
                        </Button>
                        {' '}
                        <input
                            type="text"
                            className="form-control d-inline-block ml-1"
                            placeholder="Filter rows..."
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            style={{ width: 180, verticalAlign: 'middle' }}
                        />
                        {queryError && <Alert variant="danger" className="mt-2">{queryError}</Alert>}
                        {results !== null && results.length === 0 && (
                            <Alert variant="info" className="mt-2">Query returned no results.</Alert>
                        )}
                        {results && results.length > 0 && (
                            <div style={{ maxHeight: '55vh', overflowY: 'auto', overflowX: 'auto', marginTop: '1rem' }}>
                                {results.map((res, i) => (
                                    <table key={i} className="table table-sm table-striped table-bordered" style={{ fontSize: '0.8rem' }}>
                                        <thead className="thead-dark">
                                            <tr>
                                                {res.columns.map((c) => (
                                                    <th key={c} onClick={() => handleColumnClick(c)} style={{ cursor: 'pointer' }} title="Find tables with this column">
                                                        {c}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {res.values
                                                .filter(row => !filterText || row.some(cell => cell !== null && String(cell).toLowerCase().includes(filterText.toLowerCase())))
                                                .map((row, ri) => (
                                                    <tr key={ri}>
                                                        {row.map((cell, ci) => (
                                                            <td key={ci}>
                                                                {cell === null
                                                                    ? <em>NULL</em>
                                                                    : isDateColumn(res.columns[ci]) && typeof cell === 'number' && cell > 0
                                                                        ? <>{cell}<br /><small className="text-muted">{formatUnixTimestamp(cell)}</small></>
                                                                        : String(cell)
                                                                }
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))
                                            }
                                        </tbody>
                                    </table>
                                ))}
                            </div>
                        )}
                        {crossRef && (
                            <div className="mt-3 p-2" style={{ border: '1px solid #555', borderRadius: 4, fontSize: '0.85rem' }}>
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                    <span>
                                        <strong><code>{crossRef.column}</code></strong>
                                        {' '}found in {crossRef.tables.length} table(s)
                                    </span>
                                    <Button variant="outline-secondary" size="sm" onClick={() => setCrossRef(null)}>✕</Button>
                                </div>
                                {crossRef.tables.length === 0
                                    ? <span className="text-muted">Not found in any table.</span>
                                    : crossRef.tables.map(t => (
                                        <span
                                            key={t}
                                            onClick={() => handleTableClick(t)}
                                            className="badge badge-secondary mr-1"
                                            style={{ cursor: 'pointer' }}
                                        >
                                            {t}
                                        </span>
                                    ))
                                }
                            </div>
                        )}
                    </Col>
                </Row>
            )}
        </div>
    );
}

function VersionHistoryTab() {
    const [versions, setVersions] = useState<VersionEntry[] | null>(null);
    const [versionsError, setVersionsError] = useState<string | null>(null);
    const [selectedDiff, setSelectedDiff] = useState<string | null>(null);
    const [diffData, setDiffData] = useState<DiffData | null>(null);
    const [diffLoading, setDiffLoading] = useState(false);
    const [diffError, setDiffError] = useState<string | null>(null);
    const [collapsedTables, setCollapsedTables] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetch(process.env.PUBLIC_URL + '/data/masterdata/versions.json')
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then((data: VersionEntry[]) => setVersions([...data].reverse()))
            .catch((e) => setVersionsError(String(e)));
    }, []);

    const loadDiff = async (short_hash: string) => {
        if (selectedDiff === short_hash) {
            setSelectedDiff(null);
            setDiffData(null);
            return;
        }
        setSelectedDiff(short_hash);
        setDiffData(null);
        setDiffError(null);
        setDiffLoading(true);
        setCollapsedTables(new Set());
        try {
            const resp = await fetch(process.env.PUBLIC_URL + `/data/masterdata/diffs/${short_hash}.json.gz`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const compressed = new Uint8Array(await resp.arrayBuffer());
            const text = pako.inflate(compressed, { to: 'string' });
            setDiffData(JSON.parse(text));
        } catch (e: any) {
            setDiffError(String(e));
        } finally {
            setDiffLoading(false);
        }
    };

    const toggleTable = (name: string) => {
        setCollapsedTables((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    if (versionsError) return <Alert variant="danger" className="mt-3">{versionsError}</Alert>;
    if (!versions) return <div className="mt-3"><Spinner animation="border" size="sm" /> Loading versions...</div>;
    if (versions.length === 0) return <Alert variant="info" className="mt-3">No version history yet.</Alert>;

    return (
        <div className="mt-3">
            {versions.map((v) => (
                <div key={v.hash} className="mb-2 p-2" style={{ border: '1px solid #444', borderRadius: 4 }}>
                    <div className="d-flex align-items-center justify-content-between">
                        <div>
                            <code style={{ fontSize: '0.85rem' }}>{v.short_hash}</code>
                            {' '}
                            <span className="text-muted">{v.date}</span>
                            {v.summary && (
                                <span className="ml-2">
                                    <span className="badge badge-success ml-1">+{v.summary.added}</span>
                                    <span className="badge badge-danger ml-1">-{v.summary.removed}</span>
                                    <span className="badge badge-warning ml-1">~{v.summary.modified}</span>
                                    <span className="badge badge-secondary ml-1">{v.summary.tables_changed} tables</span>
                                </span>
                            )}
                            {!v.previous_hash && (
                                <span className="badge badge-info ml-2">Initial version</span>
                            )}
                        </div>
                        {v.summary && (
                            <Button
                                variant="outline-light"
                                size="sm"
                                onClick={() => loadDiff(v.short_hash)}
                            >
                                {selectedDiff === v.short_hash ? 'Hide diff' : 'View diff'}
                            </Button>
                        )}
                    </div>

                    {selectedDiff === v.short_hash && (
                        <div className="mt-2">
                            {diffLoading && <><Spinner animation="border" size="sm" /> Loading diff...</>}
                            {diffError && <Alert variant="danger">{diffError}</Alert>}
                            {diffData && (
                                <DiffViewer diff={diffData} collapsedTables={collapsedTables} onToggleTable={toggleTable} />
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

interface DiffViewerProps {
    diff: DiffData;
    collapsedTables: Set<string>;
    onToggleTable: (name: string) => void;
}

function DiffViewer({ diff, collapsedTables, onToggleTable }: DiffViewerProps) {
    const tableNames = Object.keys(diff.tables).sort();
    return (
        <div>
            {tableNames.map((tableName) => {
                const td = diff.tables[tableName];
                const collapsed = collapsedTables.has(tableName);
                const addedCount = td.added.length;
                const removedCount = td.removed.length;
                const modifiedCount = td.modified.length;
                return (
                    <div key={tableName} className="mb-2" style={{ border: '1px solid #555', borderRadius: 4 }}>
                        <div
                            className="p-2 d-flex align-items-center justify-content-between"
                            style={{ cursor: 'pointer', backgroundColor: '#2a2a2a' }}
                            onClick={() => onToggleTable(tableName)}
                        >
                            <strong>{tableName}</strong>
                            <span>
                                {addedCount > 0 && <span className="badge badge-success ml-1">+{addedCount}</span>}
                                {removedCount > 0 && <span className="badge badge-danger ml-1">-{removedCount}</span>}
                                {modifiedCount > 0 && <span className="badge badge-warning ml-1">~{modifiedCount}</span>}
                                <span className="ml-2">{collapsed ? '▶' : '▼'}</span>
                            </span>
                        </div>
                        {!collapsed && (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="table table-sm table-bordered mb-0" style={{ fontSize: '0.78rem' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: 60 }}>Change</th>
                                            {td.columns.map((c) => <th key={c}>{c}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {td.added.map((row, i) => (
                                            <tr key={`add-${i}`} style={{ backgroundColor: 'rgba(40,167,69,0.2)' }}>
                                                <td><span className="badge badge-success">added</span></td>
                                                {row.map((cell, ci) => <td key={ci}>{cell === null ? <em>NULL</em> : String(cell)}</td>)}
                                            </tr>
                                        ))}
                                        {td.removed.map((row, i) => (
                                            <tr key={`rem-${i}`} style={{ backgroundColor: 'rgba(220,53,69,0.2)' }}>
                                                <td><span className="badge badge-danger">removed</span></td>
                                                {row.map((cell, ci) => <td key={ci}>{cell === null ? <em>NULL</em> : String(cell)}</td>)}
                                            </tr>
                                        ))}
                                        {td.modified.map((mod, i) => (
                                            <React.Fragment key={`mod-${i}`}>
                                                <tr style={{ backgroundColor: 'rgba(255,193,7,0.15)' }}>
                                                    <td><span className="badge badge-warning">before</span></td>
                                                    {mod.before.map((cell, ci) => <td key={ci}>{cell === null ? <em>NULL</em> : String(cell)}</td>)}
                                                </tr>
                                                <tr style={{ backgroundColor: 'rgba(255,193,7,0.25)' }}>
                                                    <td><span className="badge badge-warning">after</span></td>
                                                    {mod.after.map((cell, ci) => <td key={ci}>{cell === null ? <em>NULL</em> : String(cell)}</td>)}
                                                </tr>
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default function MasterDataPage() {
    return (
        <Container className="mt-4">
            <Tabs defaultActiveKey="browser" id="masterdata-tabs">
                <Tab eventKey="browser" title="Table Browser">
                    <SqlBrowserTab />
                </Tab>
                <Tab eventKey="history" title="Version History">
                    <VersionHistoryTab />
                </Tab>
            </Tabs>
        </Container>
    );
}
