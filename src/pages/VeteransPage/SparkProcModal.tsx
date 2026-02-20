import React, { useMemo, useState } from 'react';
import { Modal } from 'react-bootstrap';
import { Veteran } from './types';
import VeteranCard from './VeteranCard';
import { calculateIndividualParentAffinity, calculateGrandparentAffinity, aggregateFactors, calculateSparkChance } from '../../data/VeteransHelper';
import { getFactorColor } from './VeteransUIHelper';
import './VeteransPage.css';

interface Props {
    show: boolean;
    onHide: () => void;
    mainCharId: number | null;
    parent1: Veteran | null;
    parent2: Veteran | null;
    config: any;
}

const SparkProcModal: React.FC<Props> = ({ show, onHide, mainCharId, parent1, parent2, config }) => {
    const [isFullRun, setIsFullRun] = useState(true);

    const getTreeData = (parent: Veteran, otherParent: Veteran) => {
        if (!mainCharId) return null;
        const selfAff = calculateIndividualParentAffinity(parent, otherParent, mainCharId);

        const gp1Item = parent.succession_chara_array.find(x => x.position_id === 10);
        const gp2Item = parent.succession_chara_array.find(x => x.position_id === 20);

        const gp1Aff = calculateGrandparentAffinity(gp1Item, parent, mainCharId);
        const gp2Aff = calculateGrandparentAffinity(gp2Item, parent, mainCharId);

        return { self: selfAff, gp1: gp1Aff, gp2: gp2Aff };
    };

    const tree1Data = parent1 && parent2 ? getTreeData(parent1, parent2) : null;
    const tree2Data = parent2 && parent1 ? getTreeData(parent2, parent1) : null;

    const aggregatedProcs = useMemo(() => {
        if (!parent1 || !parent2 || !tree1Data || !tree2Data) return [];

        const allProbs: Record<string, { category: number, factorId: number, probs: number[] }> = {};

        const addFactors = (parent: Veteran, treeData: any) => {
            const factors = aggregateFactors(parent);
            for (const f of factors) {
                const chance = calculateSparkChance(f.category, f.factorId, f.level, treeData[f.sourceSlot]);
                if (chance !== null) {
                    if (!allProbs[f.name]) {
                        allProbs[f.name] = { category: f.category, factorId: f.factorId, probs: [] };
                    }
                    allProbs[f.name].probs.push(chance / 100);
                }
            }
        };

        addFactors(parent1, tree1Data);
        addFactors(parent2, tree2Data);

        const results = [];
        for (const [name, data] of Object.entries(allProbs)) {
            let dp = [1.0, 0.0];
            for (const p of data.probs) {
                const newDp = [0.0, 0.0];
                newDp[1] = dp[1] * (1 - p) + dp[0] * p;
                newDp[0] = dp[0] * (1 - p);
                dp = newDp;
            }

            const p0_single = dp[0];
            const p1_single = dp[1];

            let atLeast1 = 0;
            let atLeast2 = 0;

            if (isFullRun) {
                const p0_total = p0_single * p0_single;
                const p1_total = 2 * p0_single * p1_single;
                atLeast1 = (1 - p0_total) * 100;
                atLeast2 = (1 - p0_total - p1_total) * 100;
            } else {
                atLeast1 = (1 - p0_single) * 100;
                atLeast2 = (1 - p0_single - p1_single) * 100;
            }

            results.push({
                name,
                category: data.category,
                factorId: data.factorId,
                atLeast1,
                atLeast2
            });
        }

        const filteredResults = results.filter(r => r.category !== 1);

        filteredResults.sort((a, b) => {
            if (a.category !== b.category) return a.category - b.category;
            return b.atLeast1 - a.atLeast1;
        });

        return filteredResults;
    }, [parent1, parent2, tree1Data, tree2Data, isFullRun]);

    return (
        <Modal show={show} onHide={onHide} size="xl" scrollable>
            <Modal.Header closeButton></Modal.Header>
            <Modal.Body>
                {aggregatedProcs.length > 0 && (
                    <div className="spark-proc-container">
                        <div className="spark-proc-header">
                            <h5 className="spark-proc-title">Expected Spark Proc Odds</h5>
                            <div className="spark-proc-toggles">
                                <button
                                    className={`aff-action-btn spark-toggle-btn ${isFullRun ? 'active' : ''}`}
                                    onClick={() => setIsFullRun(true)}
                                >
                                    Over a full run
                                </button>
                                <button
                                    className={`aff-action-btn spark-toggle-btn ${!isFullRun ? 'active' : ''}`}
                                    onClick={() => setIsFullRun(false)}
                                >
                                    Only first inheritance
                                </button>
                            </div>
                        </div>
                        <div className="spark-proc-grid">
                            {aggregatedProcs.map(res => (
                                <div key={res.name} className="spark-proc-card">
                                    <span style={{ color: getFactorColor(res.factorId, config) }} className="spark-proc-factor-name">
                                        {res.name}
                                    </span>
                                    <div className="spark-proc-stats">
                                        <span>≥1 Proc: <strong className="spark-proc-stat-strong">{res.atLeast1.toFixed(2)}%</strong></span>
                                        {res.category === 2 && res.atLeast2 > 0.005 && (
                                            <span>≥2 Procs: <strong className="spark-proc-stat-strong">{res.atLeast2.toFixed(2)}%</strong></span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="vet-grid">
                    {parent1 && <VeteranCard veteran={parent1} config={config} treeAffinities={tree1Data ? { self: tree1Data.self, gp1: tree1Data.gp1, gp2: tree1Data.gp2 } : undefined} />}
                    {parent2 && <VeteranCard veteran={parent2} config={config} treeAffinities={tree2Data ? { self: tree2Data.self, gp1: tree2Data.gp1, gp2: tree2Data.gp2 } : undefined} />}
                </div>
            </Modal.Body>
        </Modal>
    );
};

export default SparkProcModal;
