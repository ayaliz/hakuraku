import React, { useMemo } from 'react';
import { ParsedRace } from '../../types';
import { computeHpSpurtStats } from './processData';
import './HpSpurtAnalysis.css';
import HpSpurtTable from './HpSpurtTable';

interface Props {
    races: ParsedRace[];
}

export const HpSpurtAnalysis: React.FC<Props> = ({ races }) => {
    const stats = useMemo(() => {
        return computeHpSpurtStats(races, undefined, true, undefined, true);
    }, [races]);

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
