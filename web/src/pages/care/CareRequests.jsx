import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp, useData } from '../../context.js';
import { RequestRow } from '../../components/care.jsx';
import { Empty, Icon, Loading } from '../../components/ui.jsx';

const FILTERS = [
  ['open', 'All open'], ['new', 'New'], ['aging', 'Unresolved / aging'], ['high', 'High urgency'],
  ['unassigned', 'Unassigned'], ['assigned', 'Assigned'], ['escalated', 'Escalated'], ['resolved', 'Resolved & closed'],
];

export default function CareRequests() {
  const { meta } = useApp();
  const [params, setParams] = useSearchParams();
  const filter = params.get('filter') || 'open';
  const category = params.get('category') || '';
  const [q, setQ] = useState(params.get('q') || '');
  const [debounced, setDebounced] = useState(q);
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const { data } = useData(`/care/requests?filter=${filter}&category=${category}&q=${encodeURIComponent(debounced)}`);
  const set = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p, { replace: true }); };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1>Requests</h1><p>Every request, private to the care team. Red and amber bars mark requests at risk of being forgotten.</p></div>
      </div>
      <div className="tabs" role="tablist">
        {FILTERS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => set('filter', k === 'open' ? '' : k)}>
            {l}{data?.counts?.[k] != null && <span className="c">{data.counts[k]}</span>}
          </button>
        ))}
      </div>
      <div className="row">
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-3)' }}><Icon name="search" /></span>
          <input className="input" style={{ paddingLeft: 36 }} placeholder="Search by name, #id, volunteer, area…" value={q} onChange={(e) => { setQ(e.target.value); set('q', e.target.value); }} />
        </div>
        <select className="select" style={{ width: 'auto' }} value={category} onChange={(e) => set('category', e.target.value)}>
          <option value="">All types of help</option>
          {Object.entries(meta.categories).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div className="card">
        {!data ? <Loading /> : data.requests.length === 0
          ? <Empty icon="🔎" title="No requests match">{filter === 'aging' ? 'Nothing is at risk of being forgotten. 🙏' : 'Try another filter or clear the search.'}</Empty>
          : <div className="req-list">{data.requests.map((r) => <RequestRow key={r.id} r={r} />)}</div>}
      </div>
    </div>
  );
}
