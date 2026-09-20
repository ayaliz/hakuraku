import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ungzip } from 'pako';
import UMDatabaseWrapper from '../../data/UMDatabaseWrapper';
import SkillAnalysis from '../MultiRacePage/components/SkillAnalysis';
import '../MultiRacePage/MultiRacePage.css';
import type { GroupSkillDetailPayload } from '../../features/umalogs/model/skillCache';
import { DATA_ROOT, simDataApiUrl, useSimData } from './data';
import { Loading } from './components';
import type { Snapshot } from './types';
import { adaptDetail, adaptOverview, styles, type Overview, type Detail } from './capturedSkillAdapter';
const emptyActivations = new Map();
const strategyStats = styles.map(s => ({ strategy: s.id, strategyName: s.name, totalRaces: NaN, wins: NaN, top3Finishes: NaN, avgFinishPosition: NaN, winningCharacters: [], saturation: [] }));
export default function CapturedSkillPreview({ snapshot }: { snapshot: Snapshot }) {
    const base = `/api/simdata/snapshots/${encodeURIComponent(snapshot.snapshotId)}/skills`;
    const result = useSimData<Overview>(simDataApiUrl(`${base}/overview`), snapshot.snapshotId, `${DATA_ROOT}/${snapshot.snapshotId}/skills/overview.json.gz`);
    return result.data ? <SkillData key={snapshot.snapshotId} data={result.data} base={base} snapshotId={snapshot.snapshotId} /> : <Loading error={result.error} retry={result.retry} />;
}
function SkillData({ data, base, snapshotId }: { data: Overview; base: string; snapshotId: string }) {
    const [details, setDetails] = useState(new Map<number, GroupSkillDetailPayload>());
    const [loading, setLoading] = useState(new Set<number>());
    const [errors, setErrors] = useState(new Map<number, string>());
    const requests = useRef(new Map<number, AbortController>());
    const attempted = useRef(new Set<number>());
    useEffect(() => () => { requests.current.forEach(c => c.abort()); }, []);
    const load = useCallback((id: number) => {
        if (attempted.current.has(id)) return;
        attempted.current.add(id);
        const controller = new AbortController(); requests.current.set(id, controller);
        setLoading(previous => new Set(previous).add(id));
        (async () => {
            let response = await fetch(simDataApiUrl(`${base}/details/${id}`), { signal: controller.signal });
            if (!response.ok) response = await fetch(`${DATA_ROOT}/${snapshotId}/skills/details/${id}.json.gz`, { signal: controller.signal });
            if (!response.ok) throw new Error(`Could not load skill details (HTTP ${response.status}).`);
            const bytes = new Uint8Array(await response.arrayBuffer());
            const json = bytes[0] === 0x1f && bytes[1] === 0x8b ? ungzip(bytes, { to: 'string' }) : new TextDecoder().decode(bytes);
            const detail = adaptDetail(JSON.parse(json) as Detail, data, id, id => UMDatabaseWrapper.skillNameWithEnglishFallback(id));
            if (!controller.signal.aborted) setDetails(previous => new Map(previous).set(id, detail));
        })().catch(error => {
            if (!controller.signal.aborted) setErrors(previous => new Map(previous).set(id, String(error.message ?? error)));
        }).finally(() => {
            requests.current.delete(id);
            if (!controller.signal.aborted) setLoading(previous => { const next = new Set(previous); next.delete(id); return next; });
        });
    }, [base, data, snapshotId]);
    const adapted = useMemo(() => adaptOverview(data, details, id => UMDatabaseWrapper.skillNameWithEnglishFallback(id)), [data, details]);
    return <section className="skill-analysis-section">
        <h4 className="section-heading">Skill Analysis</h4>
        {[...errors].map(([id, message]) => <p key={id} className="text-warning">{message} <button className="btn btn-sm btn-secondary" onClick={() => { attempted.current.delete(id); setErrors(previous => { const next = new Map(previous); next.delete(id); return next; }); load(id); }}>Retry skill details</button></p>)}
        <SkillAnalysis skillStats={adapted.stats} skillActivations={emptyActivations} avgRaceDistance={data.courseDistance} characterStats={[]} strategyStats={strategyStats} ownCharas={[]} lazySkillDetails={details} onLoadLazySkillDetail={load} lazySkillDetailLoadingIds={loading} simulationPlayerCounts={adapted.players} showStrategyProcRates enableActivationSortCycle />
    </section>;
}
