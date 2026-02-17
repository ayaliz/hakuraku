import React from "react";
import { Button, Form, InputGroup } from "react-bootstrap";
import { SparkSearch } from "./types";

interface SparkSearchBarProps {
    value: SparkSearch | null;
    onChange: (search: SparkSearch | null) => void;
}

const SparkSearchBar: React.FC<SparkSearchBarProps> = ({ value, onChange }) => {
    const current: SparkSearch = value ?? { name: '', stars: 0, includeParents: true };

    const update = (patch: Partial<SparkSearch>) => {
        const next = { ...current, ...patch };
        onChange(next.name.trim() ? next : null);
    };

    return (
        <div className="d-flex align-items-center flex-wrap gap-2 mb-2">
            <InputGroup style={{ width: 'auto', minWidth: 220 }}>
                <Form.Control
                    placeholder="Search by spark name..."
                    value={current.name}
                    onChange={e => update({ name: e.target.value })}
                />
                {current.name && (
                    <Button variant="outline-secondary" onClick={() => onChange(null)}>✕</Button>
                )}
            </InputGroup>

            <Form.Select
                value={current.stars}
                onChange={e => update({ stars: parseInt(e.target.value) })}
                style={{ width: 'auto', minWidth: 100 }}
            >
                <option value={0}>Any ★</option>
                <option value={1}>1★+</option>
                <option value={2}>2★+</option>
                <option value={3}>3★</option>
            </Form.Select>

            <Form.Check
                type="switch"
                id="spark-include-parents"
                label="Include parents"
                checked={current.includeParents}
                onChange={e => update({ includeParents: e.target.checked })}
            />
        </div>
    );
};

export default SparkSearchBar;
