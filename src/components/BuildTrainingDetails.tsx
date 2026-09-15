import AssetLoader from '../data/AssetLoader';
import type { ParentEntry, SupportCardEntry } from './RaceDataPresenter/components/CharaList/types';
import { aggregateFactors, formatFactor, getCharaImageUrl, getFactorColor } from './RaceDataPresenter/components/CharaList/utils';
import './BuildTrainingDetails.css';

export function SupportDeck({ deck, compact = false }: { deck: SupportCardEntry[]; compact?: boolean }) {
    if (!deck.length) return null;
    return <div className={`build-training-deck${compact ? ' is-compact' : ''}`}>
        {deck.map(card => <div key={card.position} className="build-training-support" title={`Support card ID: ${card.id}`}>
            <img src={AssetLoader.getSupportCardIcon(card.id) ?? ''} alt={String(card.id)} onError={event => {
                const target = event.currentTarget;
                target.style.display = 'none';
                if (target.parentElement) target.parentElement.dataset.fallback = String(card.id);
            }} />
            <span>LB {card.lb}</span>
        </div>)}
    </div>;
}

function ParentGroup({ parents, compact }: { parents: ParentEntry[]; compact?: boolean }) {
    const sorted = [...parents].sort((a, b) => a.positionId - b.positionId);
    if (!sorted.length) return null;
    const factors = aggregateFactors(sorted);
    return <div className={`build-training-parent-group${compact ? ' is-compact' : ''}`}>
        <div className="build-training-parent-images">{sorted.map(parent => <img
            key={parent.positionId}
            src={getCharaImageUrl(parent.cardId)}
            alt={String(parent.cardId)}
            title={`Card ID: ${parent.cardId}`}
        />)}</div>
        <div className="build-training-factors">{factors.length ? factors.map(factor => {
            const formatted = formatFactor(factor.id);
            return <span key={`${factor.id}-${factor.level}`}>
                <strong style={{ color: getFactorColor(factor.id) }}>{factor.nameOverride ?? formatted?.name ?? `Factor ${factor.id}`}</strong>
                <small>{factor.level}★</small>
            </span>;
        }) : <span className="build-training-empty">No factors</span>}</div>
    </div>;
}

export function ParentGroups({ parents, compact = false }: { parents: ParentEntry[]; compact?: boolean }) {
    if (!parents.length) return null;
    return <div className="build-training-parents">
        <ParentGroup parents={parents.filter(parent => Math.floor(parent.positionId / 10) === 1)} compact={compact} />
        <ParentGroup parents={parents.filter(parent => Math.floor(parent.positionId / 10) === 2)} compact={compact} />
    </div>;
}
