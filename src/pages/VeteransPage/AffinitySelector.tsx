import React, { useMemo, useState } from "react";
import { Accordion, Button, Form } from "react-bootstrap";
import './VeteransPage.css';
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";

interface AffinitySelectorProps {
    selectedCharaId: number | null;
    onSelect: (charaId: number | null) => void;
}

const AffinitySelector: React.FC<AffinitySelectorProps> = ({ selectedCharaId, onSelect }) => {
    const [search, setSearch] = useState('');

    const charas = useMemo(() =>
        Object.values(UMDatabaseWrapper.charas)
            .filter(c => c.id != null && UMDatabaseWrapper.charaRelationTypes[c.id] != null)
            .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
        []
    );

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return q ? charas.filter(c => (c.name ?? '').toLowerCase().includes(q)) : charas;
    }, [charas, search]);

    const selectedName = selectedCharaId
        ? (UMDatabaseWrapper.charas[selectedCharaId]?.name ?? `Chara ${selectedCharaId}`)
        : null;

    return (
        <Accordion className="mb-3">
            <Accordion.Item eventKey="affinity">
                <Accordion.Header>
                    Affinity Calculator{selectedName ? ` — Training: ${selectedName}` : ''}
                </Accordion.Header>
                <Accordion.Body>
                    <p className="text-muted mb-2 affinity-description">
                        Select the character being trained to see affinity scores for each veteran.
                    </p>
                    <div className="d-flex gap-2 mb-2">
                        <Form.Control
                            size="sm"
                            placeholder="Search characters..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="affinity-search-input"
                        />
                        {selectedCharaId && (
                            <Button size="sm" variant="outline-secondary" onClick={() => onSelect(null)}>
                                Clear
                            </Button>
                        )}
                    </div>
                    <div className="affinity-list">
                        {filtered.map(c => (
                            <div
                                key={c.id}
                                onClick={() => onSelect(c.id!)}
                                className={`affinity-list-item${selectedCharaId === c.id ? ' selected' : ''}`}
                            >
                                {c.name}
                            </div>
                        ))}
                        {filtered.length === 0 && (
                            <div className="text-muted p-2 affinity-description">No characters found.</div>
                        )}
                    </div>
                </Accordion.Body>
            </Accordion.Item>
        </Accordion>
    );
};

export default AffinitySelector;
