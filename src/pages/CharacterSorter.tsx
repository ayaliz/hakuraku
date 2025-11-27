import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Card, Col, Container, Row } from "react-bootstrap";
import characterImages from '../data/character_images.json';
import ShareLinkBox from "../components/ShareLinkBox";

interface Character {
    id: number;
    name: string;
    image: string;
}

type SortMode = 'FULL' | 'TOP_10' | 'TOP_20' | 'TOP_30' | 'TOP_40' | 'TOP_50';
type CompareChoice = 'A' | 'B' | 'Tie';

const parseName = (filename: string) => {
    return filename.replace(/_\(Race\)\.png$/, '').replace(/_/g, ' ');
};

const CHARACTERS: Character[] = characterImages.map((img, index) => ({
    id: index,
    name: parseName(img),
    image: `${process.env.PUBLIC_URL}/data/race_outfits_playable/${img}`
}));

const estimateComparisons = (n: number, k: number) => {
    const buildHeap = n;
    const extract = k * Math.log2(Math.max(2, n));
    const total = buildHeap + extract;
    if (!Number.isFinite(total) || total <= 0) {
        return n;
    }
    return Math.round(total);
};

const modeToK = (mode: SortMode, n: number) => {
    if (mode === 'FULL') return n;
    return parseInt(mode.replace('TOP_', ''), 10);
};

const serializeResults = (characters: Character[], ranks: number[]): string => {
    const length = Math.min(characters.length, ranks.length);
    const byteArray = new Uint8Array(length * 2);

    for (let i = 0; i < length; i++) {
        const id = characters[i].id;
        const rank = ranks[i];
        byteArray[i * 2] = id & 0xff;
        byteArray[i * 2 + 1] = Math.max(0, Math.min(255, rank));
    }

    let binaryString = '';
    for (let i = 0; i < byteArray.length; i++) {
        binaryString += String.fromCharCode(byteArray[i]);
    }

    return btoa(binaryString)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

const deserializeResults = (serialized: string): { characters: Character[]; ranks: number[] } => {
    if (!serialized) return { characters: [], ranks: [] };
    try {
        const base64 = serialized.replace(/-/g, '+').replace(/_/g, '/');
        const binaryString = atob(base64);
        const length = binaryString.length;

        if (length === 0) return { characters: [], ranks: [] };

        const ids: number[] = [];
        const ranks: number[] = [];

        if (length % 2 === 1) {
            for (let i = 0; i < length; i++) {
                const id = binaryString.charCodeAt(i);
                if (CHARACTERS[id]) {
                    ids.push(id);
                    ranks.push(ids.length);
                }
            }
        } else {
            for (let i = 0; i < length; i += 2) {
                const id = binaryString.charCodeAt(i);
                const rank = binaryString.charCodeAt(i + 1);
                if (CHARACTERS[id]) {
                    ids.push(id);
                    ranks.push(rank === 0 ? 1 : rank);
                }
            }
        }

        const characters = ids.map(id => CHARACTERS[id]);
        return { characters, ranks };
    } catch {
        return { characters: [], ranks: [] };
    }
};

class InteractiveSorter {
    private items: Character[];
    private k: number;
    private heap: number[];
    private generator: Generator<[Character, Character], void, CompareChoice>;
    private comparisonCache: Map<string, number>;
    private parent: number[];

    constructor(items: Character[], k: number) {
        this.items = items;
        this.k = Math.min(k, items.length);
        this.heap = items.map(c => c.id);
        this.comparisonCache = new Map();
        this.parent = items.map((_, index) => index);
        this.generator = this.sortGenerator();
    }

    private find(x: number): number {
        if (this.parent[x] !== x) {
            this.parent[x] = this.find(this.parent[x]);
        }
        return this.parent[x];
    }

    private union(a: number, b: number) {
        let rootA = this.find(a);
        let rootB = this.find(b);
        if (rootA === rootB) return;

        const canonical = rootA < rootB ? rootA : rootB;
        const other = canonical === rootA ? rootB : rootA;
        this.parent[other] = canonical;

        const updates: { oldKey: string; newKey: string }[] = [];
        for (const key of this.comparisonCache.keys()) {
            const [aStr, bStr] = key.split(',');
            let ia = parseInt(aStr, 10);
            let ib = parseInt(bStr, 10);
            let changed = false;

            if (ia === other) {
                ia = canonical;
                changed = true;
            }
            if (ib === other) {
                ib = canonical;
                changed = true;
            }

            if (changed) {
                const newKey = `${ia},${ib}`;
                updates.push({ oldKey: key, newKey });
            }
        }

        for (const { oldKey, newKey } of updates) {
            const value = this.comparisonCache.get(oldKey)!;
            this.comparisonCache.delete(oldKey);
            if (!this.comparisonCache.has(newKey)) {
                this.comparisonCache.set(newKey, value);
            }
        }
    }

    private *sortGenerator(): Generator<[Character, Character], void, CompareChoice> {
        const n = this.heap.length;
        for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
            yield* this.siftDown(i, n);
        }
        const limit = this.k === n ? 0 : n - this.k;
        for (let i = n - 1; i >= limit; i--) {
            this.swap(0, i);
            yield* this.siftDown(0, i);
        }
    }

    private *siftDown(root: number, end: number): Generator<[Character, Character], void, CompareChoice> {
        let current = root;
        while (2 * current + 1 < end) {
            let child = 2 * current + 1;
            let swapIndex = current;

            if ((yield* this.compare(this.heap[swapIndex], this.heap[child])) < 0) {
                swapIndex = child;
            }

            if (child + 1 < end) {
                if ((yield* this.compare(this.heap[swapIndex], this.heap[child + 1])) < 0) {
                    swapIndex = child + 1;
                }
            }

            if (swapIndex === current) {
                return;
            } else {
                this.swap(current, swapIndex);
                current = swapIndex;
            }
        }
    }

    private swap(i: number, j: number) {
        const temp = this.heap[i];
        this.heap[i] = this.heap[j];
        this.heap[j] = temp;
    }

    private *compare(idA: number, idB: number): Generator<[Character, Character], number, CompareChoice> {
        let repA = this.find(idA);
        let repB = this.find(idB);

        if (repA === repB) return 0;

        const keyAB = `${repA},${repB}`;
        const keyBA = `${repB},${repA}`;

        if (this.comparisonCache.has(keyAB)) {
            return this.comparisonCache.get(keyAB)!;
        }
        if (this.comparisonCache.has(keyBA)) {
            return -this.comparisonCache.get(keyBA)!;
        }

        const charA = this.items[repA];
        const charB = this.items[repB];
        const result = yield [charA, charB];

        let numeric: number;
        if (result === 'A') numeric = 1;
        else if (result === 'B') numeric = -1;
        else numeric = 0;

        if (numeric === 0) {
            this.union(repA, repB);
        } else {
            this.comparisonCache.set(keyAB, numeric);
        }

        return numeric;
    }

    public next(choice?: CompareChoice) {
        return this.generator.next(choice as any);
    }

    public getResult(): Character[] {
        const n = this.heap.length;
        const resultIndices = this.heap.slice(n - this.k, n);
        return resultIndices.reverse().map(id => this.items[id]);
    }

    public getRankGroupsForCharacters(chars: Character[]): Character[][] {
        const groups = new Map<number, Character[]>();
        const order: number[] = [];

        for (const char of chars) {
            const root = this.find(char.id);
            if (!groups.has(root)) {
                groups.set(root, []);
                order.push(root);
            }
            groups.get(root)!.push(char);
        }

        return order.map(root => groups.get(root)!);
    }
}

export default function CharacterSorter() {
    const [mode, setMode] = useState<'SETUP' | 'SORTING' | 'FINISHED'>('SETUP');
    const [sortMode, setSortMode] = useState<SortMode>('TOP_10');
    const [currentPair, setCurrentPair] = useState<[Character, Character] | null>(null);
    const [sortedList, setSortedList] = useState<Character[]>([]);
    const [rankList, setRankList] = useState<number[]>([]);
    const [totalComparisons, setTotalComparisons] = useState(0);
    const [history, setHistory] = useState<CompareChoice[]>([]);

    const sorterRef = useRef<InteractiveSorter | null>(null);
    const location = useLocation();

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const resultsParam = searchParams.get('r');
        if (resultsParam) {
            const { characters, ranks } = deserializeResults(resultsParam);
            if (characters.length > 0) {
                setSortedList(characters);
                setRankList(ranks);
                setMode('FINISHED');
                sorterRef.current = null;
                setHistory([]);
                setTotalComparisons(0);
                setCurrentPair(null);
            }
        }
    }, [location]);

    const startSort = (selectedMode: SortMode) => {
        const k = modeToK(selectedMode, CHARACTERS.length);
        sorterRef.current = new InteractiveSorter(CHARACTERS, k);
        setSortMode(selectedMode);
        setMode('SORTING');
        setTotalComparisons(0);
        setHistory([]);
        setSortedList([]);
        setRankList([]);
        const next = sorterRef.current.next();
        if (next.done) {
            finishSort();
        } else {
            setCurrentPair(next.value);
        }
    };

    const finishSort = () => {
        const sorter = sorterRef.current;
        if (!sorter) return;
        const resultChars = sorter.getResult();
        const groups = sorter.getRankGroupsForCharacters(resultChars);
        const newSortedList: Character[] = [];
        const newRankList: number[] = [];
        let rank = 1;
        for (const group of groups) {
            for (const char of group) {
                newSortedList.push(char);
                newRankList.push(rank);
            }
            rank++;
        }
        setSortedList(newSortedList);
        setRankList(newRankList);
        setMode('FINISHED');
        setCurrentPair(null);
    };

    const handleChoice = useCallback((choice: CompareChoice) => {
        if (!sorterRef.current) return;
        setHistory(prev => [...prev, choice]);
        setTotalComparisons(prev => prev + 1);
        const next = sorterRef.current.next(choice);
        if (next.done) {
            finishSort();
        } else if (next.value) {
            setCurrentPair(next.value);
        }
    }, []);

    const handleUndo = () => {
        if (history.length === 0) return;
        const newHistory = history.slice(0, -1);
        setHistory(newHistory);
        const k = modeToK(sortMode, CHARACTERS.length);
        const sorter = new InteractiveSorter(CHARACTERS, k);
        let next = sorter.next();
        let pair: [Character, Character] | null = null;
        let done = false;

        if (next.done) {
            done = true;
        } else {
            pair = next.value;
        }

        for (const choice of newHistory) {
            if (done) break;
            next = sorter.next(choice);
            if (next.done) {
                done = true;
                pair = null;
                break;
            } else {
                pair = next.value;
            }
        }

        sorterRef.current = sorter;
        setTotalComparisons(newHistory.length);

        if (done) {
            const resultChars = sorter.getResult();
            const groups = sorter.getRankGroupsForCharacters(resultChars);
            const newSortedList: Character[] = [];
            const newRankList: number[] = [];
            let rank = 1;
            for (const group of groups) {
                for (const char of group) {
                    newSortedList.push(char);
                    newRankList.push(rank);
                }
                rank++;
            }
            setMode('FINISHED');
            setSortedList(newSortedList);
            setRankList(newRankList);
            setCurrentPair(null);
        } else {
            setMode('SORTING');
            setSortedList([]);
            setRankList([]);
            setCurrentPair(pair);
        }
    };

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (mode !== 'SORTING' || !currentPair) return;
            if (e.key === 'a' || e.key === 'A') {
                e.preventDefault();
                handleChoice('A');
            } else if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                handleChoice('Tie');
            } else if (e.key === 'd' || e.key === 'D') {
                e.preventDefault();
                handleChoice('B');
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [mode, currentPair, handleChoice]);

    const modes: SortMode[] = ['TOP_10', 'TOP_20', 'TOP_30', 'TOP_40', 'TOP_50', 'FULL'];
    const comparisonLabel = mode === 'SORTING' ? ` (Comparison #${totalComparisons + 1})` : '';

    const displayResults = sortedList.map((char, idx) => ({
        char,
        rank: rankList[idx] ?? (idx + 1),
    }));

    return (
        <Container className="mt-4">
            <h1 className="text-center mb-4">Character Sorter{comparisonLabel}</h1>

            {mode === 'SETUP' && (
                <Card className="text-center p-4">
                    <Card.Body>
                        <h3>Select Sort Mode</h3>
                        <div className="d-flex justify-content-center gap-2 flex-wrap">
                            {modes.map(m => {
                                const k = modeToK(m, CHARACTERS.length);
                                const estimate = estimateComparisons(CHARACTERS.length, k);
                                return (
                                    <Button
                                        key={m}
                                        variant="primary"
                                        className="m-2"
                                        onClick={() => startSort(m)}
                                    >
                                        {m.replace('_', ' ')} (~{estimate} comparisons)
                                    </Button>
                                );
                            })}
                        </div>
                    </Card.Body>
                </Card>
            )}

            {mode === 'SORTING' && currentPair && (
                <div className="mt-3">
                    <div className="text-center">
                        <Row className="justify-content-center align-items-center flex-nowrap">
                            <Col xs={5} md={5} className="text-center">
                                <Card
                                    className="cursor-pointer hover-scale h-100"
                                    onClick={() => handleChoice('A')}
                                    style={{ cursor: 'pointer', transition: 'transform 0.2s', border: 'none', background: 'transparent' }}
                                >
                                    <div style={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <img
                                            src={currentPair[0].image}
                                            alt={currentPair[0].name}
                                            style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                                        />
                                    </div>
                                    <Card.Body className="p-2">
                                        <Card.Title>{currentPair[0].name}</Card.Title>
                                    </Card.Body>
                                </Card>
                            </Col>
                            <Col xs={2} className="text-center">
                                <div className="d-flex flex-column align-items-center">
                                    <Button variant="secondary" onClick={() => handleChoice('Tie')}>
                                        Tie
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        onClick={handleUndo}
                                        disabled={history.length === 0}
                                        className="mt-3"
                                    >
                                        Undo
                                    </Button>
                                    <div className="text-muted mt-2" style={{ fontSize: '0.8em' }}>
                                        A = Left, S = Tie, D = Right
                                    </div>
                                </div>
                            </Col>
                            <Col xs={5} md={5} className="text-center">
                                <Card
                                    className="cursor-pointer hover-scale h-100"
                                    onClick={() => handleChoice('B')}
                                    style={{ cursor: 'pointer', transition: 'transform 0.2s', border: 'none', background: 'transparent' }}
                                >
                                    <div style={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <img
                                            src={currentPair[1].image}
                                            alt={currentPair[1].name}
                                            style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                                        />
                                    </div>
                                    <Card.Body className="p-2">
                                        <Card.Title>{currentPair[1].name}</Card.Title>
                                    </Card.Body>
                                </Card>
                            </Col>
                        </Row>
                    </div>
                </div>
            )}

            {mode === 'FINISHED' && (
                <Card>
                    <Card.Header className="text-center">
                        <h3>Results</h3>
                        <div className="d-flex justify-content-center">
                            <div style={{ maxWidth: '500px', width: '100%' }}>
                                <ShareLinkBox
                                    shareUrl={`${window.location.href.split('?')[0]}?r=${serializeResults(
                                        displayResults.map(e => e.char),
                                        displayResults.map(e => e.rank)
                                    )}`}
                                />
                            </div>
                        </div>
                    </Card.Header>
                    <Card.Body>
                        <Row>
                            {displayResults.map(({ char, rank }) => (
                                <Col xs={12} md={6} lg={4} key={char.id} className="mb-3">
                                    <div className="d-flex align-items-center border p-2 rounded">
                                        <div className="h2 mr-3 mb-0" style={{ width: '50px', textAlign: 'center' }}>
                                            {rank}
                                        </div>
                                        <img
                                            src={char.image}
                                            alt={char.name}
                                            style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '50%' }}
                                            className="mr-3"
                                        />
                                        <div className="h5 mb-0">{char.name}</div>
                                    </div>
                                </Col>
                            ))}
                        </Row>
                        <div className="text-center mt-4">
                            <Button
                                variant="secondary"
                                className="mr-2"
                                onClick={handleUndo}
                                disabled={history.length === 0}
                            >
                                Undo
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => {
                                    setMode('SETUP');
                                    setSortedList([]);
                                    setRankList([]);
                                    setHistory([]);
                                    setTotalComparisons(0);
                                    sorterRef.current = null;
                                    setCurrentPair(null);
                                }}
                            >
                                Restart
                            </Button>
                        </div>
                    </Card.Body>
                </Card>
            )}
        </Container>
    );
}
