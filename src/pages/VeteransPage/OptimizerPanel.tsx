import React, { useState } from "react";
import { Accordion, Badge, Button, Form, Table } from "react-bootstrap";
import { Veteran, OptimizerConfig } from "./types";
import { aggregateFactors, calculateOptimizerScore } from "../../data/VeteransHelper";
import { getCardName, formatCardName } from "./VeteransUIHelper";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";

interface OptimizerPanelProps {
    veterans: Veteran[];
}

const DEFAULT_CONFIG: OptimizerConfig = {
    bluesWeight: 20,
    aptWeight: 20,
    uniqueWeight: 10,
    skillWeight: 5,
    scenarioWeight: 10,
    highValueSkills: [],
    highValueSkillBonus: 20,
    scenarioSparks: [],
};

type TransferResult = {
    veteran: Veteran;
    score: number;
    bluesStars: number;
    aptStars: number;
    uniqueStars: number;
    skillStars: number;
};

const OptimizerPanel: React.FC<OptimizerPanelProps> = ({ veterans }) => {
    const [config, setConfig] = useState<OptimizerConfig>(DEFAULT_CONFIG);
    const [results, setResults] = useState<TransferResult[] | null>(null);
    const [sparkInput, setSparkInput] = useState('');
    const [skillSearch, setSkillSearch] = useState('');

    const allSkillIds = React.useMemo(() => {
        const ids = new Set<number>();
        veterans.forEach(v => v.skill_array?.forEach(s => ids.add(s.skill_id)));
        return Array.from(ids).sort((a, b) => a - b);
    }, [veterans]);

    const allFactorNames = React.useMemo(() => {
        const names = new Set<string>();
        veterans.forEach(v => aggregateFactors(v).forEach(f => names.add(f.name)));
        return Array.from(names).sort();
    }, [veterans]);

    const filteredSkillIds = React.useMemo(() => {
        if (!skillSearch.trim()) return allSkillIds;
        const q = skillSearch.toLowerCase();
        return allSkillIds.filter(id => UMDatabaseWrapper.skillName(id).toLowerCase().includes(q));
    }, [allSkillIds, skillSearch]);

    const updateConfig = (patch: Partial<OptimizerConfig>) =>
        setConfig(c => ({ ...c, ...patch }));

    const toggleSkill = (id: number) => {
        updateConfig({
            highValueSkills: config.highValueSkills.includes(id)
                ? config.highValueSkills.filter(s => s !== id)
                : [...config.highValueSkills, id],
        });
    };

    const addSparkSuggestion = (name: string) => {
        if (!config.scenarioSparks.includes(name)) {
            updateConfig({ scenarioSparks: [...config.scenarioSparks, name] });
        }
        setSparkInput('');
    };

    const removeScenarioSpark = (name: string) => {
        updateConfig({ scenarioSparks: config.scenarioSparks.filter(s => s !== name) });
    };

    const calculate = () => {
        const scored = veterans.map(v => {
            const factors = aggregateFactors(v);
            const bluesStars = factors.filter(f => f.category === 1 && f.isGold).reduce((s, f) => s + f.level, 0);
            const aptStars = factors.filter(f => f.category === 2 && f.isGold).reduce((s, f) => s + f.level, 0);
            const uniqueStars = factors.filter(f => f.category === 3 && f.isGold).reduce((s, f) => s + f.level, 0);
            const skillStars = factors.filter(f => f.category === 5 && f.isGold).reduce((s, f) => s + f.level, 0);
            const score = calculateOptimizerScore(v, config);
            return { veteran: v, score, bluesStars, aptStars, uniqueStars, skillStars };
        });
        scored.sort((a, b) => a.score - b.score);
        setResults(scored);
    };

    const sparkSuggestions = sparkInput.trim()
        ? allFactorNames.filter(n => n.toLowerCase().includes(sparkInput.toLowerCase()) && !config.scenarioSparks.includes(n)).slice(0, 8)
        : [];

    return (
        <Accordion className="mb-4">
            <Accordion.Item eventKey="optimizer">
                <Accordion.Header>Transfer Helper</Accordion.Header>
                <Accordion.Body>
                    <div className="row g-3 mb-3">
                        {([
                            ['Blues weight (pts/★)', 'bluesWeight'],
                            ['Aptitude weight (pts/★)', 'aptWeight'],
                            ['Unique weight (pts/★)', 'uniqueWeight'],
                            ['Skill spark weight (pts/★)', 'skillWeight'],
                            ['Scenario spark weight (pts/★)', 'scenarioWeight'],
                            ['Important skill bonus (pts)', 'highValueSkillBonus'],
                        ] as [string, keyof OptimizerConfig][]).map(([label, key]) => (
                            <div key={key} className="col-sm-6 col-md-4 col-lg-3">
                                <Form.Label style={{ fontSize: '0.8rem' }}>{label}</Form.Label>
                                <Form.Control
                                    type="number"
                                    size="sm"
                                    value={config[key] as number}
                                    onChange={e => updateConfig({ [key]: parseFloat(e.target.value) || 0 } as any)}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="mb-3">
                        <Form.Label style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>Important skills</Form.Label>
                        <Form.Control
                            size="sm"
                            placeholder="Search skills..."
                            value={skillSearch}
                            onChange={e => setSkillSearch(e.target.value)}
                            className="mb-1"
                        />
                        <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #444', borderRadius: 4, padding: 6 }}>
                            {filteredSkillIds.map(id => (
                                <Form.Check
                                    key={id}
                                    type="checkbox"
                                    id={`skill-${id}`}
                                    label={UMDatabaseWrapper.skillName(id)}
                                    checked={config.highValueSkills.includes(id)}
                                    onChange={() => toggleSkill(id)}
                                    style={{ fontSize: '0.8rem' }}
                                />
                            ))}
                            {allSkillIds.length === 0 && <small className="text-muted">No skills found in loaded veterans.</small>}
                            {allSkillIds.length > 0 && filteredSkillIds.length === 0 && <small className="text-muted">No skills match search.</small>}
                        </div>
                    </div>

                    <div className="mb-3">
                        <Form.Label style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>Scenario sparks</Form.Label>
                        <div className="d-flex flex-wrap gap-1 mb-1">
                            {config.scenarioSparks.map(s => (
                                <Badge
                                    key={s}
                                    bg="info"
                                    style={{ cursor: 'pointer', fontSize: '0.8rem' }}
                                    onClick={() => removeScenarioSpark(s)}
                                    title="Click to remove"
                                >
                                    {s} ✕
                                </Badge>
                            ))}
                        </div>
                        <div style={{ position: 'relative' }}>
                            <Form.Control
                                size="sm"
                                placeholder="Type to search factor names..."
                                value={sparkInput}
                                onChange={e => setSparkInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && sparkInput.trim()) {
                                        addSparkSuggestion(sparkInput.trim());
                                    }
                                }}
                            />
                            {sparkSuggestions.length > 0 && (
                                <div style={{
                                    position: 'absolute', zIndex: 10, background: '#222', border: '1px solid #555',
                                    borderRadius: 4, width: '100%', maxHeight: 160, overflowY: 'auto'
                                }}>
                                    {sparkSuggestions.map(s => (
                                        <div
                                            key={s}
                                            style={{ padding: '4px 8px', cursor: 'pointer', fontSize: '0.85rem' }}
                                            onClick={() => addSparkSuggestion(s)}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#333')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            {s}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <Button variant="primary" onClick={calculate} disabled={veterans.length === 0}>
                        Calculate
                    </Button>

                    {results && (
                        <div className="mt-3" style={{ overflowX: 'auto' }}>
                            <Table striped bordered hover size="sm" style={{ fontSize: '0.85rem' }}>
                                <thead>
                                    <tr>
                                        <th>Character</th>
                                        <th>Score</th>
                                        <th>Blues★</th>
                                        <th>Apt★</th>
                                        <th>Unique★</th>
                                        <th>Skill★</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((r, i) => (
                                        <tr key={i}>
                                            <td>{formatCardName(getCardName(r.veteran.card_id))}</td>
                                            <td>{r.score}</td>
                                            <td>{r.bluesStars}</td>
                                            <td>{r.aptStars}</td>
                                            <td>{r.uniqueStars}</td>
                                            <td>{r.skillStars}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        </div>
                    )}
                </Accordion.Body>
            </Accordion.Item>
        </Accordion>
    );
};

export default OptimizerPanel;
