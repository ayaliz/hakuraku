import { useEffect, useMemo, useState } from 'react';
import { Modal } from 'react-bootstrap';
import AssetLoader from '../../data/AssetLoader';
import UMDatabaseWrapper from '../../data/UMDatabaseWrapper';
import { getRankIcon } from '../../components/RaceDataPresenter/components/CharaList/rankUtils';
import { computeSkillPoints } from '../../data/skillPoints';
import { DATA_ROOT, simDataApiUrl, useSimData } from './data';
import { hasRequirement, parseQuery, queryText, rankTeams } from './query';
import { courseAptitudeLabels, interval, Loading, number, Panel, percent, Portrait, RateValue, StyleLabel, styleName } from './components';
import PerformanceDistribution from './PerformanceDistribution';
import PerformerFilters from './PerformerFilters';
import { ParentGroups, SupportDeck } from '../../components/BuildTrainingDetails';
import PaginationControls from '../../components/PaginationControls';
import { teamShareUrl } from './teamLinks';
import type { Build, Card, LobbyEditorCatalog, OtherTeamsResponse, Performer, PerformerIndex, Requirement, Runner, Summary, TeamDetail, TeamDistributionResponse, TeamSearchResponse, TeamShard } from './types';

type Props = {
    data: Summary; query: string; distinct: boolean; sort: 'rate' | 'lower'; teamId: string | null;
    lobbyTeamIds: Set<string>; lobbyFull: boolean; onToggleLobby: (team: Performer) => void; onOpenLobby: () => void;
    lobbyRunnerIds: Set<string>; lobbyRunnerFull: boolean; onAddLobbyRunner: (runner: Runner) => void;
    onChange: (values: Record<string, string | null>) => void;
};

const buildStats = [
    { icon: 'speed', label: 'Speed', index: 0 },
    { icon: 'stamina', label: 'Stamina', index: 1 },
    { icon: 'power', label: 'Power', index: 2 },
    { icon: 'guts', label: 'Guts', index: 3 },
    { icon: 'wit', label: 'Wit', index: 4 },
] as const;

const teamsPerPage = 15;

function staticTeamUrl(data: Summary, teamId: string, archiveIndex?: number): string | undefined {
    const index = archiveIndex ?? (/^t\d+$/.test(teamId) ? Number(teamId.slice(1)) : undefined);
    if (index === undefined) return undefined;
    const file = data.storage?.teamShards
        ? `${Math.floor(index / 256)}.json.gz`
        : `${encodeURIComponent(teamId)}.json`;
    return `${DATA_ROOT}/${data.snapshotId}/teams/${file}`;
}

function teamFromPayload(payload: TeamDetail | TeamShard | undefined, teamId: string) {
    if (!payload) return undefined;
    return 'team' in payload ? payload.team : payload.teams[teamId];
}

function BuildDetails({ data, teamId, archiveIndex, inLobby, lobbyFull, onToggleLobby, close }: {
    data: Summary; teamId: string; archiveIndex?: number; inLobby: boolean; lobbyFull: boolean;
    onToggleLobby: (team: Performer) => void; close: () => void;
}) {
    const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
    const result = useSimData<TeamDetail | TeamShard>(
        simDataApiUrl(`/api/simdata/snapshots/${encodeURIComponent(data.snapshotId)}/teams/${encodeURIComponent(teamId)}`),
        data.snapshotId,
        staticTeamUrl(data, teamId, archiveIndex),
    );
    const team = teamFromPayload(result.data, teamId);
    const aptitudeLabels = courseAptitudeLabels(data.meta);
    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(teamShareUrl(teamId));
            setCopyState('copied');
        } catch {
            setCopyState('failed');
        }
    };
    return <Modal show onHide={close} size="xl" centered className="sim-team-modal" aria-labelledby="sim-team-title">
        <Modal.Header closeButton closeVariant="white"><Modal.Title id="sim-team-title">Team details</Modal.Title><div className="sim-team-modal-actions">{team && <button type="button" className={`sim-lobby-add${inLobby ? ' is-added' : ''}`} disabled={!inLobby && lobbyFull} onClick={() => onToggleLobby(team)}>{inLobby ? 'Remove from lobby' : lobbyFull ? 'Lobby full' : 'Add to lobby'}</button>}<button type="button" className="sim-copy-team-link" aria-live="polite" onClick={copyLink}>{copyState === 'copied' ? 'Link copied' : copyState === 'failed' ? 'Copy failed' : 'Copy link'}</button></div></Modal.Header>
        <Modal.Body>{team && result.data ? <>
            <div className="sim-team-summary"><strong>{percent(team.wins / team.n)} team win rate</strong><span>{interval(team.ci)} · 95% interval</span><span>{number(team.n)} races</span></div>
            <div className="sim-build-grid">{team.members.map((runner, i) => {
                const card = data.cards[runner.card];
                const rank = getRankIcon(runner.score);
                const aptitudeItems = [
                    { label: aptitudeLabels.surface, grade: runner.aptitudes[1] },
                    { label: aptitudeLabels.distance, grade: runner.aptitudes[0] },
                    { label: styleName(runner.racingStyle), grade: runner.aptitudes[2] },
                ];
                return <article className="sim-build" key={runner.id}>
                    <header><Portrait card={runner.card} name={card.name} large /><div><h3>{card.name}</h3><StyleLabel style={runner.style} racingStyle={runner.racingStyle} /></div></header>
                    <dl className="sim-build-stats">{buildStats.map(stat => <div key={stat.icon}><dt><img src={AssetLoader.getStatIcon(stat.icon)} alt="" /><span>{stat.label}</span></dt><dd>{number(runner.stats[stat.index])}</dd></div>)}</dl>
                    <dl className="sim-build-aptitudes">{aptitudeItems.map(({ label, grade }) => {
                        const icon = AssetLoader.getGradeIcon(grade);
                        return <div key={label}><dt>{label}</dt><dd>{icon ? <img src={icon} alt={grade} /> : grade}</dd></div>;
                    })}</dl>
                    <dl className="sim-build-facts"><div><dt>Individual win rate</dt><dd>{percent(team.memberWins[i] / team.n)}</dd></div>
                        <div><dt>Share of team wins</dt><dd>{team.wins ? percent(team.memberWins[i] / team.wins) : '—'} · {number(team.memberWins[i])} wins</dd></div>
                        <div><dt>Rank score</dt><dd className="sim-build-rank"><img src={rank.icon} alt={rank.name} />{number(runner.score)}</dd></div>
                        <div><dt>Skill points</dt><dd className="sim-build-skill-points"><img src={AssetLoader.getStatIcon('hint')} alt="" />{number(computeSkillPoints(new Set(runner.skills.map(([id]) => id))))} <span>({number(runner.skills.length)} skills)</span></dd></div>
                    </dl>
                    {(runner.deck?.length || runner.parents?.length) ? <details className="sim-training-details">
                        <summary>Training setup</summary>
                        <div className="sim-training-content">
                            {runner.deck?.length ? <section><h4>Support deck</h4><SupportDeck deck={runner.deck} compact /></section> : null}
                            {runner.parents?.length ? <section><h4>Parents</h4><ParentGroups parents={runner.parents} compact /></section> : null}
                        </div>
                    </details> : null}
                    <div className="sim-skills"><ul>{runner.skills.map(([id, level]) => {
                        const baseId = id >= 900000 && id < 1000000 ? id - 800000 : id;
                        const icon = result.data!.skillIcons?.[id] ?? UMDatabaseWrapper.skills[baseId]?.iconId;
                        return <li key={id} title={`Skill ID: ${id}`}><span className="sim-skill-name">{icon ? <img src={AssetLoader.getSkillIcon(icon)} alt="" loading="lazy" /> : null}{result.data!.skills[id] ?? UMDatabaseWrapper.skillNameWithEnglishFallback(id)}</span>{level > 1 && <span className="sim-skill-level">Lv. {level}</span>}</li>;
                    })}</ul></div>
                </article>;
            })}</div>
        </> : <Loading error={result.error} retry={result.retry} />}</Modal.Body>
    </Modal>;
}

const statIcons = [
    ['speed', 'Speed'], ['stamina', 'Stamina'], ['wit', 'Wit'],
    ['power', 'Power'], ['guts', 'Guts'], ['hint', 'Skill Points'],
] as const;

function hasBuildData(runner: Runner): runner is Build {
    return Array.isArray(runner.stats) && runner.stats.length === 5 && Array.isArray(runner.skills);
}

function PerformerMember({ runner, card, memberWins, teamWins, inBuilder, builderFull, onOpen, onAddToBuilder }: {
    runner: Runner; card: Card; memberWins: number; teamWins: number; inBuilder: boolean; builderFull: boolean;
    onOpen: () => void; onAddToBuilder: () => void;
}) {
    const rank = getRankIcon(runner.score);
    const winShare = teamWins > 0 ? percent(memberWins / teamWins) : '—';
    const values = hasBuildData(runner)
        ? [runner.stats[0], runner.stats[1], runner.stats[4], runner.stats[2], runner.stats[3], computeSkillPoints(new Set(runner.skills.map(([id]) => id)))]
        : null;
    return <div className="sim-performer-member">
        <button type="button" className="sim-performer-member-details" title={`View team details · ${card.name} · ${styleName(runner.style, true, runner.racingStyle)}`} aria-label={`View team details for ${card.name}'s team`} onClick={onOpen}>
        <div className="sim-performer-member-head">
            <Portrait card={runner.card} name={card.name} />
            <span className="sim-performer-rank" title={`${number(runner.score)} rank score`}><img src={rank.icon} alt={rank.name} /><span>{number(runner.score)}</span></span>
            <span className="sim-performer-member-identity"><strong>{card.name}</strong><StyleLabel style={runner.style} racingStyle={runner.racingStyle} short /></span>
            <span className="sim-performer-win-share" title={`${number(memberWins)} of ${number(teamWins)} team wins`}><strong>{winShare}</strong><small>of team wins</small></span>
            <span className="sim-performer-open-cue" aria-hidden="true">›</span>
        </div>
        {values ? <div className="sim-performer-stats">{statIcons.map(([icon, label], index) => <span key={icon} title={label}>
            <img src={AssetLoader.getStatIcon(icon)} alt={label} />{number(values[index])}
        </span>)}</div> : <span className="sim-performer-stats-loading">Build details unavailable</span>}
        </button>
        <button type="button" className={`sim-performer-add-builder${inBuilder ? ' is-added' : ''}`} disabled={inBuilder || builderFull || !hasBuildData(runner)} onClick={onAddToBuilder}>{inBuilder ? 'Added to builder' : builderFull ? 'Builder full' : hasBuildData(runner) ? '+ Add to builder' : 'Loading build…'}</button>
    </div>;
}

function PerformerTeam({ team, data, lobbyRunnerIds, lobbyRunnerFull, onOpen, onAddLobbyRunner }: {
    team: Performer; data: Summary; lobbyRunnerIds: Set<string>; lobbyRunnerFull: boolean;
    onOpen: () => void; onAddLobbyRunner: (runner: Runner) => void;
}) {
    const needsDetails = !team.members.every(hasBuildData);
    const staticUrl = needsDetails ? staticTeamUrl(data, team.id, team.archiveIndex) : undefined;
    const details = useSimData<TeamDetail | TeamShard>(
        needsDetails
            ? staticUrl ?? simDataApiUrl(`/api/simdata/snapshots/${encodeURIComponent(data.snapshotId)}/teams/${encodeURIComponent(team.id)}`)
            : null,
        data.snapshotId,
    );
    const hydrated = teamFromPayload(details.data, team.id);
    const members = hydrated?.members ?? team.members;
    return <div className="sim-performer-team">{members.map((runner, index) => <PerformerMember
        key={`${runner.id}-${index}`}
        runner={runner}
        card={data.cards[runner.card]}
        memberWins={team.memberWins[index] ?? 0}
        teamWins={team.wins}
        inBuilder={lobbyRunnerIds.has(runner.id)}
        builderFull={lobbyRunnerFull}
        onOpen={onOpen}
        onAddToBuilder={() => onAddLobbyRunner(runner)}
    />)}</div>;
}

function OtherTeamsModal({ data, sourceTeam, close, onOpenTeam, lobbyRunnerIds, lobbyRunnerFull, onAddLobbyRunner }: {
    data: Summary; sourceTeam: Performer; close: () => void; onOpenTeam: (teamId: string) => void;
    lobbyRunnerIds: Set<string>; lobbyRunnerFull: boolean; onAddLobbyRunner: (runner: Runner) => void;
}) {
    const result = useSimData<OtherTeamsResponse>(
        simDataApiUrl(`/api/simdata/snapshots/${encodeURIComponent(data.snapshotId)}/teams/${encodeURIComponent(sourceTeam.id)}/other-teams`),
        data.snapshotId,
    );
    const otherTeams = result.data?.teams.filter(team => team.id !== sourceTeam.id) ?? [];
    return <Modal show onHide={close} size="xl" centered className="sim-team-modal sim-other-teams-modal" aria-label="Other teams">
        <Modal.Header closeButton closeVariant="white" />
        <Modal.Body>
            <p className="sim-other-teams-note">Each player's simulation budget is split across all their teams. Weaker teams may be dropped automatically.</p>
            {!result.data ? <Loading error={result.error} retry={result.retry} /> : otherTeams.length ? <div className="sim-other-teams-list">{otherTeams.map(team => <article className="sim-other-team" key={team.id}>
                <PerformerTeam team={team} data={data} lobbyRunnerIds={lobbyRunnerIds} lobbyRunnerFull={lobbyRunnerFull} onAddLobbyRunner={onAddLobbyRunner} onOpen={() => onOpenTeam(team.id)} />
                <div className="sim-other-team-metrics"><span><strong>{percent(team.wins / team.n)}</strong> win rate</span><span>{interval(team.ci)} · 95% interval</span><span>{number(team.n)} races</span><button type="button" className="sim-other-team-details" onClick={() => onOpenTeam(team.id)}>View details</button></div>
            </article>)}</div> : <p className="sim-empty">This player has no other teams in the current snapshot.</p>}
        </Modal.Body>
    </Modal>;
}

export default function Performers({ data, query, distinct, sort, teamId, lobbyTeamIds, lobbyFull, lobbyRunnerIds, lobbyRunnerFull, onToggleLobby, onAddLobbyRunner, onOpenLobby, onChange }: Props) {
    const [page, setPage] = useState(1);
    const [selectedTeamId, setSelectedTeamId] = useState<string | null>(teamId);
    const [otherTeamsFor, setOtherTeamsFor] = useState<Performer | null>(null);
    useEffect(() => { setPage(1); }, [query, distinct, sort]);
    useEffect(() => { if (teamId) setSelectedTeamId(teamId); }, [teamId]);
    const parsed = useMemo(() => {
        try { return { slots: parseQuery(query, data.cards), error: null }; }
        catch (error) { return { slots: null, error: (error as Error).message }; }
    }, [query, data.cards]);
    const serverUrl = parsed.slots ? simDataApiUrl(
        `/api/simdata/snapshots/${encodeURIComponent(data.snapshotId)}/teams?slots=${encodeURIComponent(JSON.stringify(parsed.slots))}&players=${distinct ? 'unique' : 'all'}&sort=${sort}&limit=${teamsPerPage}&offset=${(page - 1) * teamsPerPage}`,
    ) : null;
    const server = useSimData<TeamSearchResponse>(serverUrl, data.snapshotId);
    const distributionUrl = parsed.slots ? simDataApiUrl(
        `/api/simdata/snapshots/${encodeURIComponent(data.snapshotId)}/team-distribution?slots=${encodeURIComponent(JSON.stringify(parsed.slots))}&players=${distinct ? 'unique' : 'all'}&sort=${sort}`,
    ) : null;
    const distribution = useSimData<TeamDistributionResponse>(distributionUrl, data.snapshotId);
    const catalog = useSimData<LobbyEditorCatalog>(
        simDataApiUrl(`/api/simdata/snapshots/${encodeURIComponent(data.snapshotId)}/editor-catalog`),
        data.snapshotId,
        `${DATA_ROOT}/${data.snapshotId}/editor-catalog.json`,
    );
    const hasDetailedFilters = Boolean(parsed.slots?.some(slot => slot.details?.length));
    const useStaticFallback = Boolean(server.error) && !hasDetailedFilters;
    const index = useSimData<PerformerIndex>(useStaticFallback && parsed.slots
        ? `${DATA_ROOT}/${data.snapshotId}/${data.storage?.performerIndex ?? 'performers.json'}` : null, data.snapshotId);
    const allMatching = useMemo(() => index.data && parsed.slots
        ? rankTeams(index.data.teams, parsed.slots, false, sort) : [],
    [index.data, parsed.slots, sort]);
    const matching = server.data?.teams ?? allMatching;
    const rows = useMemo(() => {
        if (server.data) return server.data.teams;
        if (!distinct) return matching;
        const seen = new Set<string>();
        return matching.filter(team => { if (seen.has(team.owner.id)) return false; seen.add(team.owner.id); return true; });
    }, [server.data, matching, distinct]);
    const visibleRows = server.data ? rows : rows.slice((page - 1) * teamsPerPage, page * teamsPerPage);
    const totalRows = server.data ? (distinct ? server.data.totalOwners : server.data.totalTeams) : rows.length;
    const population = useMemo(() => {
        const included = parsed.slots?.filter(slot => !slot.exclude);
        if (!included || parsed.slots?.some(slot => slot.exclude) || included.length !== 3 || !included.every(slot => slot.style !== undefined && !slot.anyOf)) return undefined;
        const key = included.map(slot => slot.style!).sort((a, b) => a - b).join('-');
        return data.archetypes.find(row => row.key === key);
    }, [parsed.slots, data.archetypes]);
    const search = (q: string) => {
        setSelectedTeamId(null);
        onChange({ q: q || null, ...(teamId ? { team: null, member: null } : {}) });
    };
    const selected = server.data
        ? server.data.teams.find(t => t.id === selectedTeamId) ?? (selectedTeamId ? { id: selectedTeamId } : undefined)
        : index.data?.teams.find(t => t.id === selectedTeamId);
    const loading = !parsed.error && !server.data && !server.error
        || useStaticFallback && !index.data;
    const loadError = useStaticFallback ? index.error : server.error;
    const emptySlots = [{}, {}, {}] as Requirement[];
    const changeSlots = (slots: Requirement[]) => search(slots.every(slot => !hasRequirement(slot)) ? '' : queryText(slots, data.cards));
    return <div className="sim-sections">
        <Panel title="Team filters" controls={<button type="button" className="sim-filter-reset" disabled={!query} onClick={() => search('')}>Reset</button>}>
            <PerformerFilters slots={parsed.slots ?? emptySlots} cards={data.cards} pairs={data.pairs} catalog={catalog.data} onSlotsChange={changeSlots} />
        </Panel>
        {!parsed.error && <PerformanceDistribution
            distribution={distribution.data}
            population={population}
            distinct={distinct}
            sort={sort}
            loading={!distribution.data && !distribution.error}
            error={distribution.error}
            retry={distribution.retry}
        />}
        <Panel title="Archetype Analysis" controls={<div className="sim-performer-controls">{lobbyTeamIds.size > 0 && <button type="button" className="sim-lobby-shortcut" onClick={onOpenLobby}>Lobby <strong>{lobbyTeamIds.size}/3</strong></button>}<div className="sim-performer-mode-control"><span>Show</span><div className="sim-segmented" role="group" aria-label="How matching teams are represented"><button type="button" title="Show every matching evaluated team" className={!distinct ? 'is-active' : ''} aria-pressed={!distinct} onClick={() => onChange({ players: 'all' })}>All teams</button><button type="button" title="Keep each player’s highest-ranked matching team" className={distinct ? 'is-active' : ''} aria-pressed={distinct} onClick={() => onChange({ players: 'unique' })}>Best per player</button></div></div></div>}>
            {loading ? <Loading error={loadError} retry={() => { server.retry(); index.retry(); }} /> : parsed.error ? <p className="sim-empty">The selected team filters could not be read.</p> : visibleRows.length ? <>
                <div className="sim-table-scroll"><table className="sim-table sim-performer-table"><thead><tr><th>#</th><th>Team · select an Uma for details</th><th>Team win%</th><th className={sort === 'lower' ? 'sim-sorted-column' : undefined} title={sort === 'lower' ? 'Sorted by the lower bound of the 95% interval, descending' : undefined}>95% interval{sort === 'lower' && <span className="sim-sort-arrow" aria-label="sorted descending">↓</span>}</th><th>Races</th><th>Player</th><th>Lobby</th></tr></thead><tbody>{visibleRows.map((team, i) => {
                    const inLobby = lobbyTeamIds.has(team.id);
                    return <tr key={team.id} className={team.id === selectedTeamId ? 'sim-selected-row' : undefined}>
                    <td>{(page - 1) * teamsPerPage + i + 1}</td><td><PerformerTeam team={team} data={data} lobbyRunnerIds={lobbyRunnerIds} lobbyRunnerFull={lobbyRunnerFull} onAddLobbyRunner={onAddLobbyRunner} onOpen={() => setSelectedTeamId(team.id)} /></td><td><RateValue value={team.wins / team.n} ci={team.ci} wins={team.wins} n={team.n} /></td><td>{interval(team.ci)}</td><td>{number(team.n)}</td><td><button type="button" className="sim-other-teams-button" aria-label={`Show other teams by ${team.owner.names[0] ?? 'this player'}`} onClick={() => setOtherTeamsFor(team)}>Other teams</button></td><td><button type="button" className={`sim-lobby-add${inLobby ? ' is-added' : ''}`} disabled={!inLobby && lobbyFull} onClick={() => onToggleLobby(team)}>{inLobby ? 'Added' : lobbyFull ? 'Full' : '+ Add'}</button></td>
                </tr>;
                })}</tbody></table></div><PaginationControls currentPage={page} totalItems={totalRows} pageSize={teamsPerPage} allowPageJump className="pagination-controls--compact sim-performer-pagination" onPageChange={setPage} />
            </> : <p className="sim-empty">No captured teams match these requirements.</p>}
        </Panel>
        {selectedTeamId && !loading && !selected && <p className="sim-query-error" role="alert">This team is not part of the selected snapshot. <button className="sim-link" type="button" onClick={() => { setSelectedTeamId(null); if (teamId) onChange({ team: null, member: null }); }}>Dismiss</button></p>}
        {otherTeamsFor && <OtherTeamsModal data={data} sourceTeam={otherTeamsFor} lobbyRunnerIds={lobbyRunnerIds} lobbyRunnerFull={lobbyRunnerFull} onAddLobbyRunner={onAddLobbyRunner} close={() => setOtherTeamsFor(null)} onOpenTeam={id => { setOtherTeamsFor(null); setSelectedTeamId(id); }} />}
        {selected && <BuildDetails data={data} teamId={selected.id} archiveIndex={'archiveIndex' in selected ? selected.archiveIndex : undefined} inLobby={lobbyTeamIds.has(selected.id)} lobbyFull={lobbyFull} onToggleLobby={onToggleLobby} close={() => { setSelectedTeamId(null); if (teamId) onChange({ team: null, member: null }); }} />}
    </div>;
}
