import React from 'react';
import { Form, Button } from 'react-bootstrap';
import UMDatabaseWrapper from '../../data/UMDatabaseWrapper';

export type SortOption =
    | 'none'
    | 'blues'
    | 'total_common'
    | 'total_skills'
    | 'legacy_common'
    | 'legacy_skills'
    | 'date'
    | 'affinity';

export type SortDirection = 'asc' | 'desc';

interface VeteransSorterProps {
    activeSort: SortOption;
    sortDirection: SortDirection;
    onSortChange: (sort: SortOption) => void;
    onDirectionToggle: () => void;
    affinityCharaId?: number | null;
}

const VeteransSorter: React.FC<VeteransSorterProps> = ({
    activeSort,
    sortDirection,
    onSortChange,
    onDirectionToggle,
    affinityCharaId,
}) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        onSortChange(e.target.value as SortOption);
    };

    return (
        <div className="d-flex align-items-center">
            <Form.Label className="me-2 mb-0" style={{ whiteSpace: 'nowrap', marginRight: '10px', fontWeight: 'bold' }}>
                Sort By:
            </Form.Label>
            <Form.Control 
                as="select"
                value={activeSort} 
                onChange={handleChange}
                style={{ width: 'auto', minWidth: '200px', display: 'inline-block' }}
            >
                <option value="none">None</option>
                <option value="blues">Blue Count</option>
                <option value="total_common">Total Common Stars</option>
                <option value="total_skills">Total Skills Stars</option>
                <option value="legacy_common">Legacy Common Stars</option>
                <option value="legacy_skills">Legacy Skills Stars</option>
                <option value="date">Created Date</option>
                <option value="affinity" disabled={!affinityCharaId}>
                    {affinityCharaId
                        ? `Affinity: ${UMDatabaseWrapper.charas[affinityCharaId]?.name ?? affinityCharaId}`
                        : 'Affinity (select a character first)'}
                </option>
            </Form.Control>
            <Button 
                variant="outline-secondary" 
                onClick={onDirectionToggle}
                disabled={activeSort === 'none'}
                style={{ marginLeft: '10px', whiteSpace: 'nowrap' }}
            >
                {sortDirection === 'desc' ? '↓ Desc' : '↑ Asc'}
            </Button>
        </div>
    );
};

export default VeteransSorter;