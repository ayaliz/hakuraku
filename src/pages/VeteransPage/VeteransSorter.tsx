import React from 'react';
import { Form } from 'react-bootstrap';

export type SortOption = 
    | 'none'
    | 'blues' 
    | 'total_common' 
    | 'total_skills' 
    | 'legacy_common' 
    | 'legacy_skills';

interface VeteransSorterProps {
    activeSort: SortOption;
    onSortChange: (sort: SortOption) => void;
}

const VeteransSorter: React.FC<VeteransSorterProps> = ({ activeSort, onSortChange }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        onSortChange(e.target.value as SortOption);
    };

    return (
        <div className="d-flex align-items-center mb-3">
            <Form.Label className="me-2 mb-0" style={{ whiteSpace: 'nowrap', marginRight: '10px', fontWeight: 'bold' }}>
                Sort By:
            </Form.Label>
            <Form.Control 
                as="select"
                value={activeSort} 
                onChange={handleChange}
                style={{ width: 'auto', minWidth: '200px', display: 'inline-block' }}
            >
                <option value="none">Date</option>
                <option value="blues">Blue Count</option>
                <option value="total_common">Total Common Stars</option>
                <option value="total_skills">Total Skills Stars</option>
                <option value="legacy_common">Legacy Common Stars</option>
                <option value="legacy_skills">Legacy Skills Stars</option>
            </Form.Control>
        </div>
    );
};

export default VeteransSorter;