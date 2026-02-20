import React, { useMemo, useState } from 'react';
import { Form, Modal } from 'react-bootstrap';
import './VeteransPage.css';
import { Veteran } from './types';
import { calculateAffinity, calculatePairAffinity } from '../../data/VeteransHelper';
import { getCharaImageUrl, getCardName, formatCardName } from './VeteransUIHelper';
import AssetLoader from '../../data/AssetLoader';
import UMDatabaseWrapper from '../../data/UMDatabaseWrapper';

interface Props {
    mainCharId: number | null;
    onMainCharChange: (id: number | null) => void;
    parent1: Veteran | null;
    parent2: Veteran | null;
    parent2IsBorrowed: boolean;
    activeSlot: 'p1' | 'p2' | null;
    onLegacySlotClick: (slot: 'p1' | 'p2') => void;
    onBorrowLookup: (viewerId: string) => Promise<void>;
    borrowLoading: boolean;
    onReset: () => void;
    onPlannerOpen: () => void;
    onSparkProcOpen: () => void;
}

const AffinityCalculatorPanel: React.FC<Props> = ({
    mainCharId, onMainCharChange,
    parent1, parent2, parent2IsBorrowed, activeSlot, onLegacySlotClick,
    onBorrowLookup, borrowLoading, onReset, onPlannerOpen, onSparkProcOpen,
}) => {
    const [showMainPicker, setShowMainPicker] = useState(false);
    const [mainSearch, setMainSearch] = useState('');
    const [borrowId, setBorrowId] = useState('');
    const [borrowError, setBorrowError] = useState<string | null>(null);

    const p1Aff = mainCharId && parent1 ? calculateAffinity(parent1, mainCharId) : null;
    const p2Aff = mainCharId && parent2 ? calculateAffinity(parent2, mainCharId) : null;
    const pairAff = parent1 && parent2 ? calculatePairAffinity(parent1, parent2) : null;
    const total = (p1Aff ?? 0) + (p2Aff ?? 0) + (pairAff ?? 0);
    const hasAny = p1Aff !== null || p2Aff !== null;

    const allCharas = useMemo(() =>
        Object.values(UMDatabaseWrapper.charas)
            .filter(c => c.id != null && UMDatabaseWrapper.charaRelationTypes[c.id] != null)
            .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
        []
    );

    const filteredCharas = useMemo(() => {
        const q = mainSearch.toLowerCase();
        return q ? allCharas.filter(c => (c.name ?? '').toLowerCase().includes(q)) : allCharas;
    }, [allCharas, mainSearch]);

    const selectChara = (id: number) => {
        onMainCharChange(id);
        setShowMainPicker(false);
        setMainSearch('');
    };

    const handleBorrow = async () => {
        if (!borrowId.trim()) return;
        setBorrowError(null);
        try {
            await onBorrowLookup(borrowId.trim());
            setBorrowId('');
        } catch (e: any) {
            setBorrowError(e.message ?? String(e));
        }
    };

    const renderLegacySlot = (slot: 'p1' | 'p2') => {
        const vet = slot === 'p1' ? parent1 : parent2;
        const isActive = activeSlot === slot;
        const isBorrowed = slot === 'p2' && parent2IsBorrowed;
        const label = slot === 'p1' ? 'Legacy 1' : 'Legacy 2';
        const subLabel = vet ? (isBorrowed ? 'Borrow' : formatCardName(getCardName(vet.card_id))) : 'Select';

        return (
            <div className={`aff-slot${isActive ? ' active' : ''}`} onClick={() => onLegacySlotClick(slot)}>
                <div className="aff-slot-card">
                    {vet ? (
                        <img
                            className="aff-slot-portrait"
                            src={getCharaImageUrl(vet.card_id)}
                            alt={subLabel}
                            onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                        />
                    ) : (
                        <div className="aff-slot-plus"></div>
                    )}
                </div>
                <div className="aff-slot-label">{label}</div>
                <div className={`aff-slot-sub${vet ? ' filled' : ''}`}>{subLabel}</div>
            </div>
        );
    };

    const renderMainSlot = () => {
        const isActive = showMainPicker;
        const subLabel = mainCharId
            ? (UMDatabaseWrapper.charas[mainCharId]?.name ?? `Chara ${mainCharId}`)
            : 'Select';

        return (
            <div className={`aff-slot${isActive ? ' active' : ''}`} onClick={() => { setShowMainPicker(true); setMainSearch(''); }}>
                <div className="aff-slot-card">
                    {mainCharId ? (
                        <img
                            className="aff-slot-portrait"
                            src={AssetLoader.getCharaIcon(mainCharId)}
                            alt={subLabel}
                            onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                        />
                    ) : (
                        <div className="aff-slot-plus"></div>
                    )}
                </div>
                <div className="aff-slot-label">Main Uma</div>
                <div className={`aff-slot-sub${mainCharId ? ' filled' : ''}`}>{subLabel}</div>
            </div>
        );
    };

    return (
        <div className="aff-panel">
            <div className="aff-tree">
                {hasAny ? (
                    <div className="aff-breakdown-side">
                        {p1Aff !== null && <span className="aff-breakdown-item">Legacy 1: <strong>+{p1Aff}</strong></span>}
                        {p2Aff !== null && <span className="aff-breakdown-item">Legacy 2: <strong>+{p2Aff}</strong></span>}
                        {pairAff !== null && <span className="aff-breakdown-item">L1 × L2: <strong>+{pairAff}</strong></span>}
                        <span className="aff-breakdown-item total">Total: <strong>+{total}</strong></span>
                    </div>
                ) : (
                    <div style={{ width: '83px' }} />
                )}
                {renderMainSlot()}
                {renderLegacySlot('p1')}
                {renderLegacySlot('p2')}
                <div className="aff-tree-actions">
                    <div className="aff-borrow-row">
                        <Form.Control
                            size="sm"
                            placeholder="Friend code for Legacy 2..."
                            value={borrowId}
                            onChange={e => setBorrowId(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleBorrow()}
                            className="aff-borrow-input"
                        />
                        <button className="aff-action-btn" onClick={handleBorrow} disabled={borrowLoading || !borrowId.trim()}>
                            {borrowLoading ? '...' : 'Borrow'}
                        </button>
                    </div>
                    {borrowError && <small className="aff-borrow-error">{borrowError}</small>}
                    <button className="aff-action-btn" onClick={onReset}>
                        ↺ Reset
                    </button>
                    <button
                        className="aff-action-btn aff-planner-btn"
                        disabled={!mainCharId || !parent1 || !parent2}
                        onClick={onPlannerOpen}
                    >
                        Parent Run Planner
                    </button>
                    <button
                        className="aff-action-btn aff-planner-btn"
                        disabled={!mainCharId || !parent1 || !parent2}
                        onClick={onSparkProcOpen}
                    >
                        Spark Proc Chance
                    </button>
                </div>
            </div>

            {activeSlot && (
                <p className="aff-select-hint">
                    Scroll down and click "Set as Legacy {activeSlot === 'p1' ? '1' : '2'}" on a veteran — or click the slot again to cancel.
                </p>
            )}

            <Modal show={showMainPicker} onHide={() => { setShowMainPicker(false); setMainSearch(''); }} size="lg" scrollable>
                <Modal.Header closeButton>
                    <Modal.Title>Select Main Uma</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Control
                        size="sm"
                        placeholder="Search characters..."
                        value={mainSearch}
                        onChange={e => setMainSearch(e.target.value)}
                        className="mb-3"
                        autoFocus
                    />
                    <div className="aff-chara-grid">
                        {filteredCharas.map(c => (
                            <div
                                key={c.id}
                                className={`aff-chara-card${mainCharId === c.id ? ' selected' : ''}`}
                                onClick={() => selectChara(c.id!)}
                            >
                                <img
                                    src={AssetLoader.getCharaIcon(c.id!)}
                                    alt={c.name ?? ''}
                                    className="aff-chara-card-img"
                                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                                />
                                <div className="aff-chara-card-name">{c.name}</div>
                            </div>
                        ))}
                    </div>
                </Modal.Body>
            </Modal>
        </div>
    );
};

export default AffinityCalculatorPanel;
