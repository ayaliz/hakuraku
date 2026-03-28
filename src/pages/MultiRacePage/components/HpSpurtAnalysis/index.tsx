import React from 'react';
import { CharaHpSpurtStats } from './types';
import './HpSpurtAnalysis.css';
import HpSpurtTable from './HpSpurtTable';

interface Props {
    stats: CharaHpSpurtStats[];
}

const HpSpurtAnalysis: React.FC<Props> = ({ stats }) => {
    return (
        <div className="hp-analysis-wrapper">
            {stats.length === 0 ? (
                <div className="text-center text-muted p-4">
                    No user characters found in the loaded races.
                </div>
            ) : (
                <HpSpurtTable stats={stats} />
            )}
        </div>
    );
};

export default HpSpurtAnalysis;
