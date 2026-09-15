import { useState } from "react";

import { Loading, number, percent } from "./components";
import { DATA_ROOT, useSimData } from "./data";
import { effectClass, signed, skillIcon } from "./skillEffectPresentation";
import type { SkillDecisionMetric, SkillDecisions } from "./types";

function decisionValue(metric: "win" | "time", result: SkillDecisionMetric) {
    return metric === "time" ? `${signed(result.mean, 3)}s` : `${signed(result.mean * 100, 2)} pp`;
}

export default function SkillDecisionPilot() {
    const result = useSimData<SkillDecisions>(`${DATA_ROOT}/skill-decisions-front-pilot.json.gz`);
    const [expanded, setExpanded] = useState<number | null>(null);
    const [sort, setSort] = useState<"win" | "time">("win");
    if (!result.data) {
        return result.error
            ? <div className="sim-skill-pilot-audit"><strong>Equal-budget pilot unavailable.</strong> {result.error}</div>
            : <Loading retry={result.retry} />;
    }

    const data = result.data;
    const rows = [...data.skills].sort((left, right) => (sort === "win"
        ? right.draftingValue.individualWinDelta.mean - left.draftingValue.individualWinDelta.mean
        : right.draftingValue.finishTimeGainSeconds.mean - left.draftingValue.finishTimeGainSeconds.mean)
        || left.name.localeCompare(right.name));
    const effect = (metric: "win" | "time", result: SkillDecisionMetric) => (
        <span
            className={`sim-skill-effect ${effectClass(result)}`}
            title={`95% owner-shell interval: ${metric === "time"
                ? `${result.ci95.map((item) => signed(item, 3)).join(" to ")}s`
                : `${result.ci95.map((item) => signed(item * 100, 2)).join(" to ")} pp`}`}
        >
            {decisionValue(metric, result)}
        </span>
    );

    return <section className="sim-skill-decision-pilot">
        <div className="sim-skill-decision-heading">
            <div><span>Balanced v2 pilot · Front Runner only</span><h2>Equal-budget drafting value</h2></div>
            <span className="sim-skill-decision-status">Sampling checks passed</span>
        </div>
        <p className="sim-skill-decision-question">For the same runner shell and skill-point budget, did the best searched package containing this skill beat the best equally searched package excluding it?</p>
        <div className="sim-skill-pilot-facts">
            <span>{number(data.simulatorExecutions)} simulations</span>
            <span>{data.audit.balancedCandidatesPerArm} candidates per side</span>
            <span>{number(data.audit.identicalResults)}/{number(data.audit.validationPairs)} A/A pairs identical</span>
            <span>Split-half agreement {data.audit.splitHalfSkillEffectCorrelation.toFixed(3)}</span>
            <span>Runaway excluded</span>
        </div>
        <div className="sim-skill-decision-controls">
            <label>Rank by <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
                <option value="win">Individual win</option><option value="time">Finish time</option>
            </select></label>
        </div>
        <div className="sim-table-scroll"><table className="sim-table sim-skill-decision-table"><thead><tr>
            <th>Skill</th><th>Type</th><th>Activates</th><th>Individual win</th><th>Team win</th><th>Time gain</th><th>Full spurt</th>
        </tr></thead><tbody>{rows.map((skill) => {
            const open = expanded === skill.skillId;
            const icon = skillIcon(skill.skillId);
            return <tr key={skill.skillId} className={open ? "sim-selected-row" : ""}>
                <td><button type="button" className="sim-skill-row-button" onClick={() => setExpanded((value) => value === skill.skillId ? null : skill.skillId)} aria-expanded={open}>
                    {icon && <img src={icon} alt="" loading="lazy" />}<span><strong>{skill.name}</strong><small>{skill.skillId} · {skill.cost} SP</small></span><i aria-hidden="true">{open ? "▾" : "▸"}</i>
                </button>{open && <div className="sim-skill-row-detail">
                    <span><strong>Individual-win interval:</strong> {skill.draftingValue.individualWinDelta.ci95.map((item) => signed(item * 100, 2)).join(" to ")} pp across {skill.shells} owner shells.</span>
                    <span><strong>Mechanics:</strong> full spurt {percent(skill.mechanics.without.fullSpurtRate)} without → {percent(skill.mechanics.with.fullSpurtRate)} with; HP deficit {percent(skill.mechanics.without.hpDeficitRate)} → {percent(skill.mechanics.with.hpDeficitRate)}.</span>
                    <span>{skill.condition || "No extra activation condition recorded."}</span>
                    <small>{data.method.primaryQuestion} {data.method.limitations}</small>
                </div>}</td>
                <td><span className={`sim-skill-kind sim-skill-kind-${skill.category}`}>{skill.category}</span></td>
                <td>{percent(skill.mechanics.with.activationRate)}</td>
                <td>{effect("win", skill.draftingValue.individualWinDelta)}</td>
                <td>{effect("win", skill.draftingValue.teamWinDelta)}</td>
                <td>{effect("time", skill.draftingValue.finishTimeGainSeconds)}</td>
                <td>{percent(skill.mechanics.without.fullSpurtRate)} → {percent(skill.mechanics.with.fullSpurtRate)}</td>
            </tr>;
        })}</tbody></table></div>
        <small className="sim-skill-decision-footnote">Pilot scope: one CM19 course, 20 held-out owner shells, 6,500 paired evaluation races per skill. Intervals resample owner shells, not individual races.</small>
    </section>;
}
