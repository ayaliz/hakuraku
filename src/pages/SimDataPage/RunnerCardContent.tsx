import type { ReactNode } from 'react';
import AssetLoader from '../../data/AssetLoader';
import { getRankIcon } from '../../components/RaceDataPresenter/components/CharaList/rankUtils';
import { computeSkillPoints } from '../../data/skillPoints';
import { number, Portrait, StyleLabel } from './components';
import type { Card, Runner } from './types';

const statIcons = [
    ['speed', 'Speed'], ['stamina', 'Stamina'], ['wit', 'Wit'],
    ['power', 'Power'], ['guts', 'Guts'], ['hint', 'Skill Points'],
] as const;

/** Shared compact Uma box content for archetype results and JSON imports. */
export default function RunnerCardContent({ runner, card, children }: { runner: Runner; card: Card; children?: ReactNode }) {
    const rank = getRankIcon(runner.score);
    const values = runner.stats?.length === 5 && Array.isArray(runner.skills)
        ? [runner.stats[0], runner.stats[1], runner.stats[4], runner.stats[2], runner.stats[3], computeSkillPoints(new Set(runner.skills.map(([id]) => id)))]
        : null;
    return <>
        <div className="sim-performer-member-head">
            <Portrait card={runner.card} name={card.name} />
            <span className="sim-performer-rank" title={`${number(runner.score)} rank score`}><img src={rank.icon} alt={rank.name} /><span>{number(runner.score)}</span></span>
            <span className="sim-performer-member-identity"><strong title={card.outfit ? `${card.name} - ${card.outfit}` : card.name}>{card.name}</strong><StyleLabel style={runner.style} racingStyle={runner.racingStyle} short /></span>
            {children}
        </div>
        {values ? <div className="sim-performer-stats">{statIcons.map(([icon, label], index) => <span key={icon} title={label}>
            <img src={AssetLoader.getStatIcon(icon)} alt={label} />{number(values[index])}
        </span>)}</div> : <span className="sim-performer-stats-loading">Build details unavailable</span>}
    </>;
}
