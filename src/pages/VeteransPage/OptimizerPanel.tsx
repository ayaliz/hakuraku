import React, { useState } from "react";
import { Accordion, Button, Form, Table } from "react-bootstrap";
import './VeteransPage.css';
import { Veteran, OptimizerConfig } from "./types";
import { aggregateFactors, calculateOptimizerScore, calculateRaceBonus } from "../../data/VeteransHelper";
import { getCardName, formatCardName, getCharaImageUrl } from "./VeteransUIHelper";
import { getRankIcon } from "../../components/RaceDataPresenter/components/CharaList/rankUtils";
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
};

type FactorSummary = { name: string; level: number };

type TransferResult = {
    veteran: Veteran;
    score: number;
    bluesFactors: FactorSummary[];
    aptFactors: FactorSummary[];
    uniqueStars: number;
    skillStars: number;
    skillFactors: FactorSummary[];
    scenarioFactors: FactorSummary[];
    raceBonus: number;
};

const stars = (n: number) => '★'.repeat(n);
const factorCell = (items: FactorSummary[]) =>
    items.length === 0 ? '—' : items.map(f => `${f.name} ${stars(f.level)}`).join(', ');

const OptimizerPanel: React.FC<OptimizerPanelProps> = ({ veterans }) => {
    const [config, setConfig] = useState<OptimizerConfig>(DEFAULT_CONFIG);
    const [results, setResults] = useState<TransferResult[] | null>(null);
    const [skillSearch, setSkillSearch] = useState('');

    const allSkillIds = React.useMemo(() => {
        const ids = new Set<number>();
        veterans.forEach(v => v.skill_array?.forEach(s => ids.add(s.skill_id)));
        return Array.from(ids).sort((a, b) => a - b);
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

    const calculate = () => {
        const scored = veterans.map(v => {
            const factors = aggregateFactors(v);
            const bluesFactors = factors.filter(f => f.category === 1 && f.isGold).map(f => ({ name: f.name, level: f.level }));
            const aptFactors = factors.filter(f => f.category === 2 && f.isGold).map(f => ({ name: f.name, level: f.level }));
            const uniqueStars = factors.filter(f => f.category === 3 && f.isGold).reduce((s, f) => s + f.level, 0);
            const goldSkills = factors.filter(f => f.category === 5 && f.isGold);
            const skillStars = goldSkills.reduce((s, f) => s + f.level, 0);
            const skillFactors = goldSkills.map(f => ({ name: f.name, level: f.level }));
            const scenarioFactors = factors.filter(f => f.isGold && f.category === 4 && String(f.factorId).startsWith('3')).map(f => ({ name: f.name, level: f.level }));
            const score = calculateOptimizerScore(v, config);
            const raceBonus = calculateRaceBonus(v).total;
            return { veteran: v, score, bluesFactors, aptFactors, uniqueStars, skillStars, skillFactors, scenarioFactors, raceBonus };
        });
        scored.sort((a, b) => a.score - b.score);
        setResults(scored);
    };

    return (
        <Accordion className="mb-4">
            <Accordion.Item eventKey="optimizer">
                <Accordion.Header>Transfer Helper</Accordion.Header>
                <Accordion.Body>
                    <div className="row g-3 mb-3">
                        {([
                            ['Blues weight (score/★)', 'bluesWeight'],
                            ['Aptitude weight (score/★)', 'aptWeight'],
                            ['Unique weight (score/★)', 'uniqueWeight'],
                            ['Skill spark weight (score/★)', 'skillWeight'],
                            ['Scenario spark weight (score/★)', 'scenarioWeight'],
                            ['Important skill bonus (score)', 'highValueSkillBonus'],
                        ] as [string, keyof OptimizerConfig][]).map(([label, key]) => (
                            <div key={key} className="col-sm-6 col-md-4 col-lg-3">
                                <Form.Label className="opt-label">{label}</Form.Label>
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
                        <Form.Label className="opt-label-bold">Important skills</Form.Label>
                        <Form.Control
                            size="sm"
                            placeholder="Search skills..."
                            value={skillSearch}
                            onChange={e => setSkillSearch(e.target.value)}
                            className="mb-1"
                        />
                        <div className="opt-skills-scroll">
                            {filteredSkillIds.map(id => (
                                <Form.Check
                                    key={id}
                                    type="checkbox"
                                    id={`skill-${id}`}
                                    label={UMDatabaseWrapper.skillName(id)}
                                    checked={config.highValueSkills.includes(id)}
                                    onChange={() => toggleSkill(id)}
                                    className="opt-checkbox"
                                />
                            ))}
                            {allSkillIds.length === 0 && <small className="text-muted">No skills found in loaded veterans.</small>}
                            {allSkillIds.length > 0 && filteredSkillIds.length === 0 && <small className="text-muted">No skills match search.</small>}
                        </div>
                    </div>

                    <Button variant="primary" onClick={calculate} disabled={veterans.length === 0}>
                        Calculate
                    </Button>

                    {results && (
                        <div className="mt-3 opt-results">
                            <Table striped bordered hover size="sm" className="opt-table">
                                <thead>
                                    <tr>
                                        <th>Character</th>
                                        <th>Rating</th>
                                        <th>Blues</th>
                                        <th>Aptitude</th>
                                        <th>Unique★</th>
                                        <th>Skill★</th>
                                        <th>Scenario★</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((r, i) => (
                                        <tr key={i}>
                                            <td className="opt-cell-nowrap">
                                                <img src={getCharaImageUrl(r.veteran.card_id)} alt="" className="opt-char-img" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                                {formatCardName(getCardName(r.veteran.card_id))}
                                            </td>
                                            <td className="opt-cell-nowrap">
                                                {(() => { const ri = getRankIcon(r.veteran.rank_score); return <><img src={ri.icon} alt={ri.name} className="opt-rank-icon" />{r.veteran.rank_score.toLocaleString()}</>; })()}
                                            </td>
                                            <td>{factorCell(r.bluesFactors)}</td>
                                            <td>{factorCell(r.aptFactors)}</td>
                                            <td>{r.uniqueStars || '—'}</td>
                                            <td title={factorCell(r.skillFactors)} style={{ cursor: r.skillStars ? 'help' : undefined }}>{r.skillStars || '—'}</td>
                                            <td>{factorCell(r.scenarioFactors)}</td>
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
