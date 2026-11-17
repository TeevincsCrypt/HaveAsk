import { Link, useNavigate } from 'react-router-dom';
import { useApp, useData } from '../../context.js';
import { AlertItem, RequestRow } from '../../components/care.jsx';
import { AIBadge, Empty, Icon, Loading, ResponsibleAINote } from '../../components/ui.jsx';

export default function CareDashboard() {
  const { user, meta } = useApp();
  const nav = useNavigate();
  const { data } = useData('/care/overview');
  const { data: reqs } = useData('/care/requests?filter=open');
  if (!data || !reqs) return <Loading />;
  const { stats, alerts, capacity, feedback } = data;
  const open = alerts.filter((a) => a.status === 'open');
  const review = reqs.requests.filter((r) => !r.assignment && r.pending_suggestions > 0 && !r.safeguarding).slice(0, 4);
  const fb = Object.fromEntries(feedback.map((f) => [f.rating, f.n]));
  const fbTotal = (fb.yes || 0) + (fb.somewhat || 0) + (fb.no || 0);
  const hour = new Date().getHours();

  const Stat = ({ n, l, h, cls, to }) => (
    <button className={`stat ${cls || ''}`} onClick={() => nav(to)}>
      <div className="n">{n}</div><div className="l">{l}</div>{h && <div className="h">{h}</div>}
    </button>
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, {user.name.replace(/^(Pastor|Rev\.)\s/, '').split(' ')[0]}</h1>
          <p>{open.length > 0
            ? `${open.length} request${open.length > 1 ? 's' : ''} may be slipping through the cracks and need${open.length > 1 ? '' : 's'} your attention.`
            : 'No requests are at risk right now. Thank you for caring well.'}</p>
        </div>
        <Link to="/care/requests" className="btn">View all requests <Icon name="arrow" /></Link>
      </div>

      <div className="stats">
        <Stat n={stats.new} l="New requests" h="Last 48 hours, unassigned" to="/care/requests?filter=new" />
        <Stat n={stats.aging} l="Unresolved / aging" h="Flagged or idle too long" cls={stats.aging ? 'warn' : ''} to="/care/requests?filter=aging" />
        <Stat n={stats.high} l="High urgency" h="Open, AI- or member-rated" cls={stats.high ? 'crit' : ''} to="/care/requests?filter=high" />
        <Stat n={stats.unassigned} l="Unassigned" h={`${stats.awaiting_review} with AI matches ready`} to="/care/requests?filter=unassigned" />
        <Stat n={stats.open - stats.unassigned} l="Assigned & active" h={`${stats.resolved_30d} resolved in 30 days`} to="/care/requests?filter=assigned" />
      </div>

      <div className="dash-grid">
        <div className="stack" style={{ gap: 20 }}>
          <section className="card alert-panel">
            <div className="card-head">
              <div>
                <h2 className="row" style={{ gap: 8, color: 'var(--crit)' }}><Icon name="alert" size={18} />Needs attention</h2>
                <p>Requests the care monitor thinks may be forgotten, with a suggested next step.</p>
              </div>
              <Link to="/care/alerts" className="btn sm">All alerts</Link>
            </div>
            {alerts.length === 0
              ? <Empty icon="✅" title="Nothing at risk">Every open request has recent activity and an owner.</Empty>
              : alerts.map((a) => <AlertItem key={a.id} a={a} />)}
          </section>

          <section className="card">
            <div className="card-head">
              <div><h2>Open requests</h2><p>Sorted by risk, then urgency.</p></div>
              <Link to="/care/requests" className="btn ghost sm">Filters & search <Icon name="arrow" /></Link>
            </div>
            <div className="req-list">
              {reqs.requests.length === 0 ? <Empty icon="🕊️" title="No open requests" /> : reqs.requests.slice(0, 8).map((r) => <RequestRow key={r.id} r={r} />)}
            </div>
          </section>
        </div>

        <aside className="stack" style={{ gap: 20 }}>
          <section className="card ai-panel">
            <div className="card-head">
              <div className="stack-sm" style={{ gap: 2 }}><AIBadge>AI suggestions to review</AIBadge><p>Matches are proposals only — nothing is sent until you approve.</p></div>
            </div>
            <div className="card-body stack-sm">
              {review.length === 0 ? <p className="small muted">No suggestions waiting for review.</p> : review.map((r) => (
                <Link key={r.id} to={`/care/requests/${r.id}`} className="match" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <div className="spread"><b className="small">#{r.id} {r.member_name}</b><span className="tiny faint">{meta.categories[r.category]}</span></div>
                  <span className="small muted">{r.summary}</span>
                  <span className="small" style={{ color: 'var(--ai)', fontWeight: 600 }}>{r.pending_suggestions} suggested match{r.pending_suggestions > 1 ? 'es' : ''} → Review</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Volunteer capacity</h2><Link to="/care/volunteers" className="small">Roster</Link></div>
            <div className="card-body stack-sm">
              <div className="spread small"><span>Available for new requests</span><b>{capacity.available} of {capacity.total}</b></div>
              <div className="spread small"><span>At capacity</span><b style={{ color: capacity.at_capacity ? 'var(--warn)' : undefined }}>{capacity.at_capacity}</b></div>
              <p className="tiny faint">AI matching avoids suggesting volunteers who are already at capacity.</p>
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Member check-ins</h2></div>
            <div className="card-body stack-sm small">
              {fbTotal === 0 ? <span className="muted">No feedback yet.</span> : <>
                <div className="spread"><span>“Yes, it helped”</span><b>{fb.yes || 0}</b></div>
                <div className="spread"><span>“Somewhat”</span><b>{fb.somewhat || 0}</b></div>
                <div className="spread"><span>“Not really”</span><b>{fb.no || 0}</b></div>
              </>}
              <p className="tiny faint">After a request is resolved, members get one optional, gentle “Was the help useful?” prompt.</p>
            </div>
          </section>

          <div className="card card-pad small muted"><ResponsibleAINote /></div>
        </aside>
      </div>
    </div>
  );
}
