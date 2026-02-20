import React, { useMemo, useState } from 'react';
import { Form, Modal } from 'react-bootstrap';
import { Veteran } from './types';
import UMDatabaseWrapper from '../../data/UMDatabaseWrapper';
import GameDataLoader from '../../data/GameDataLoader';
import AssetLoader from '../../data/AssetLoader';
import './VeteransPage.css';

interface Props {
    show: boolean;
    onHide: () => void;
    mainCharId: number | null;
    parent1: Veteran | null;
    parent2: Veteran | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface PlannerTile {
    id: number;
    label: string;
    year: 'junior' | 'classic' | 'senior';
    debut?: boolean;
}

function generateTiles(): PlannerTile[] {
    const tiles: PlannerTile[] = [];
    let id = 0;

    tiles.push({ id: id++, label: 'Debut', year: 'junior', debut: true });
    tiles.push({ id: id++, label: 'Late Jul', year: 'junior' });

    for (let m = 7; m <= 11; m++) {
        tiles.push({ id: id++, label: `Early ${MONTHS[m]}`, year: 'junior' });
        tiles.push({ id: id++, label: `Late ${MONTHS[m]}`, year: 'junior' });
    }
    for (let m = 0; m <= 11; m++) {
        tiles.push({ id: id++, label: `Early ${MONTHS[m]}`, year: 'classic' });
        tiles.push({ id: id++, label: `Late ${MONTHS[m]}`, year: 'classic' });
    }
    for (let m = 0; m <= 11; m++) {
        tiles.push({ id: id++, label: `Early ${MONTHS[m]}`, year: 'senior' });
        tiles.push({ id: id++, label: `Late ${MONTHS[m]}`, year: 'senior' });
    }

    return tiles;
}

const TILES = generateTiles();

const YEAR_ABBR: Record<string, string> = {
    junior: 'Jr.',
    classic: 'Cl.',
    senior: 'Sr.',
};

function getTileLabel(tile: PlannerTile): string {
    if (tile.debut) return 'Debut';
    return `${YEAR_ABBR[tile.year]} ${tile.label}`;
}

type Portrait = { slot: 'main' | 'p1' | 'p2'; charaId: number };

type TileEntry = {
    iconId: number;
    instanceId?: number;
    isCareer: boolean;
    name?: string;
    portraits: Portrait[];
};

function getRaceBannerUrl(iconId: number): string {
    const padded = String(iconId).padStart(4, '0');
    return `${import.meta.env.BASE_URL}assets/textures/race_banners/thum_race_rt_000_${padded}_00.webp`;
}

function getTileIndex(year: number, month: number, half: number): number | null {
    let tile: number;
    if (year === 1) {
        if (month < 7 || month > 12) return null;
        tile = (month - 7) * 2 + half;
    } else if (year === 2) {
        tile = 12 + (month - 1) * 2 + half;
    } else if (year === 3) {
        tile = 36 + (month - 1) * 2 + half;
    } else {
        return null;
    }
    if (tile < 0) return null;
    if (tile >= TILES.length) tile = TILES.length - 1;
    return tile;
}

const RacePlannerModal: React.FC<Props> = ({ show, onHide, mainCharId, parent1, parent2 }) => {
    const [lockCareerRaces, setLockCareerRaces] = useState(true);
    const [conflictCycle, setConflictCycle] = useState<Record<number, number>>({});

    const mainName = mainCharId ? (UMDatabaseWrapper.charas[mainCharId]?.name ?? `Chara ${mainCharId}`) : '';

    const uraRaceMultiMap = useMemo((): Map<number, number[]> => {
        try {
            const races = GameDataLoader.uraRaces;
            const map = new Map<number, number[]>();
            for (const r of races) {
                if (typeof r.instance !== 'number') continue;
                const tileIdx = getTileIndex(r.year, r.month, r.half);
                if (tileIdx == null) continue;
                if (!map.has(r.instance)) map.set(r.instance, []);
                map.get(r.instance)!.push(tileIdx);
            }
            for (const tiles of map.values()) tiles.sort((a, b) => a - b);
            return map;
        } catch {
            return new Map();
        }
    }, []);

    const tileMap = useMemo((): Map<number, TileEntry[]> => {
        const map = new Map<number, TileEntry[]>();

        const getEntries = (tileIdx: number): TileEntry[] => {
            if (!map.has(tileIdx)) map.set(tileIdx, []);
            return map.get(tileIdx)!;
        };

        if (lockCareerRaces && mainCharId != null) {
            const mainPortrait: Portrait = { slot: 'main', charaId: mainCharId };
            try {
                const data = GameDataLoader.umaRaces;
                const prefix = String(mainCharId);
                const cardKey = Object.keys(data).find(k => k.startsWith(prefix));
                const entries = cardKey ? data[cardKey] : null;
                if (entries) {
                    for (const entry of entries) {
                        const tileIdx = Math.min(entry.turn - 12, TILES.length - 1);
                        if (tileIdx >= 0) {
                            for (const race of entry.races) {
                                getEntries(tileIdx).push({
                                    iconId: race.icon_id,
                                    isCareer: true,
                                    name: race.name_en,
                                    portraits: [mainPortrait],
                                });
                            }
                        }
                    }
                }
            } catch { /* ignore */ }
        }

        if (uraRaceMultiMap.size > 0) {
            const winSaddle = UMDatabaseWrapper.winSaddleToRaceInstance;

            const addParent = (parent: Veteran | null, slot: 'p1' | 'p2') => {
                if (!parent) return;
                const charaId = Math.floor(parent.card_id / 100);
                const portrait: Portrait = { slot, charaId };
                const seenInstances = new Set<number>();

                for (const saddleId of parent.win_saddle_id_array) {
                    const raceInstanceId = winSaddle[saddleId];
                    if (!raceInstanceId || seenInstances.has(raceInstanceId)) continue;
                    seenInstances.add(raceInstanceId);

                    const altTiles = uraRaceMultiMap.get(raceInstanceId);
                    if (!altTiles || altTiles.length === 0) continue;

                    const tileIdx = altTiles[0];
                    const iconId = Math.floor(raceInstanceId / 100);
                    const entries = getEntries(tileIdx);

                    const existing = entries.find(e => e.iconId === iconId);
                    if (existing) {
                        existing.portraits.push(portrait);
                    } else {
                        entries.push({ iconId, instanceId: raceInstanceId, isCareer: false, portraits: [portrait] });
                    }
                }
            };

            addParent(parent1, 'p1');
            addParent(parent2, 'p2');
        }

        const isNonCareerFree = (tile: number): boolean =>
            (map.get(tile) ?? []).filter(e => !e.isCareer).length === 0;

        const tryMove = (entry: TileEntry, fromTile: number): boolean => {
            if (!entry.instanceId) return false;
            const alts = uraRaceMultiMap.get(entry.instanceId) ?? [];
            for (const altTile of alts) {
                if (altTile === fromTile) continue;
                if (isNonCareerFree(altTile)) {
                    const fromList = map.get(fromTile)!;
                    fromList.splice(fromList.indexOf(entry), 1);
                    getEntries(altTile).push(entry);
                    return true;
                }
            }
            return false;
        };

        for (const [tileIdx, tileEntries] of [...map.entries()]) {
            for (const slot of ['p1', 'p2'] as const) {
                const parentEntries = [...tileEntries].filter(e =>
                    !e.isCareer && e.portraits.some(p => p.slot === slot)
                );
                if (parentEntries.length < 2) continue;

                for (const entry of parentEntries) {
                    const still = tileEntries.filter(e =>
                        !e.isCareer && e.portraits.some(p => p.slot === slot)
                    );
                    if (still.length < 2) break;
                    tryMove(entry, tileIdx);
                }
            }
        }

        const conflicts: { tileIdx: number; p1Only: TileEntry[]; p2Only: TileEntry[] }[] = [];
        for (const [tileIdx, tileEntries] of map) {
            const nonCareer = tileEntries.filter(e => !e.isCareer);
            const p1Only = nonCareer.filter(e =>
                e.portraits.some(p => p.slot === 'p1') && !e.portraits.some(p => p.slot === 'p2')
            );
            const p2Only = nonCareer.filter(e =>
                e.portraits.some(p => p.slot === 'p2') && !e.portraits.some(p => p.slot === 'p1')
            );
            if (p1Only.length > 0 && p2Only.length > 0) {
                conflicts.push({ tileIdx, p1Only, p2Only });
            }
        }

        for (const { tileIdx, p1Only, p2Only } of conflicts) {
            let resolved = false;
            for (const entry of p1Only) {
                if (tryMove(entry, tileIdx)) { resolved = true; break; }
            }
            if (!resolved) {
                for (const entry of p2Only) {
                    if (tryMove(entry, tileIdx)) break;
                }
            }
        }

        return map;
    }, [lockCareerRaces, mainCharId, parent1, parent2, uraRaceMultiMap]);

    const handleTileClick = (tileId: number, conflictCount: number) => {
        setConflictCycle(prev => ({
            ...prev,
            [tileId]: ((prev[tileId] ?? 0) + 1) % conflictCount,
        }));
    };

    return (
        <Modal show={show} onHide={onHide} size="xl" scrollable>
            <Modal.Header closeButton>
                <Modal.Title>
                    Parent Run Planner
                    {mainName && <span className="planner-title-sub"> — {mainName}</span>}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <div className="planner-toolbar">
                    <Form.Check
                        type="switch"
                        id="lock-career-races"
                        label="Show main uma career races"
                        checked={lockCareerRaces}
                        onChange={e => setLockCareerRaces(e.target.checked)}
                        className="planner-career-toggle"
                    />
                </div>

                <div className="planner-grid">
                    {TILES.map((tile, i) => {
                        const prevYear = i > 0 ? TILES[i - 1].year : null;
                        const yearChanged = tile.year !== prevYear;
                        const entries = tileMap.get(tile.id) ?? [];

                        const careerEntries = entries.filter(e => e.isCareer);
                        const nonCareerEntries = entries.filter(e => !e.isCareer);
                        const hasCareers = careerEntries.length > 0;

                        const hasConflict = !hasCareers && nonCareerEntries.some(e =>
                            e.portraits.some(p => p.slot === 'p1') && !e.portraits.some(p => p.slot === 'p2')
                        ) && nonCareerEntries.some(e =>
                            e.portraits.some(p => p.slot === 'p2') && !e.portraits.some(p => p.slot === 'p1')
                        );

                        const shownNonCareer = hasCareers
                            ? []
                            : hasConflict
                                ? [nonCareerEntries[(conflictCycle[tile.id] ?? 0) % nonCareerEntries.length]]
                                : nonCareerEntries;

                        const entriesToShow = [...careerEntries, ...shownNonCareer];

                        return (
                            <div key={tile.id} className="planner-cell">
                                <div className="planner-cell-label">{getTileLabel(tile)}</div>
                                <div
                                    className={`planner-tile planner-tile-${tile.year}${tile.debut ? ' planner-tile-debut' : ''}${yearChanged && !tile.debut ? ' planner-tile-year-start' : ''}`}
                                    onClick={hasConflict ? () => handleTileClick(tile.id, nonCareerEntries.length) : undefined}
                                >
                                    {hasConflict && (
                                        <img
                                            src={AssetLoader.getBlockedIcon()}
                                            alt=""
                                            title="Both parents ran a different race on this turn, click to cycle"
                                            className="planner-conflict-icon"
                                        />
                                    )}
                                    {entriesToShow.map((entry, idx) => (
                                        <div
                                            key={`${entry.iconId}-${idx}`}
                                            className="planner-parent-race"
                                        >
                                            <img
                                                src={getRaceBannerUrl(entry.iconId)}
                                                alt={entry.name ?? ''}
                                                title={entry.name}
                                                className="planner-race-icon"
                                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                            {entry.portraits.map((p, pi) => (
                                                <img
                                                    key={`${p.slot}-${pi}`}
                                                    src={AssetLoader.getCharaIcon(p.charaId)}
                                                    alt=""
                                                    className="planner-parent-portrait"
                                                    style={{ right: `${1 + pi * 22}px` }}
                                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Modal.Body>
        </Modal>
    );
};

export default RacePlannerModal;
