import { Link } from 'react-router-dom';
import { useApp, useData } from '../../context.js';
import { relTime } from '../../format.js';
import { AssignmentStatus, Category, Empty, Icon, Loading, Urgency } from '../../components/ui.jsx';

export default function VolunteerHome() {
  const { user, meta, now } = useApp();
  const { data, loading } = useData('/vol/assignments');
  const { data: prof } = useData('/vol/profile');
  const list = data?.assignments || [];
  const offers = list.filter((a) => a.status === 'offered');
  const active = list.filter((a) => ['accepted', 'contacted', 'helping', 'needs_support'].includes(a.status));
  const past = list.filter((a) => ['completed', 'declined', 'withdrawn'].includes(a.status));

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head">
        <div>
          <h1>Thank you for serving, {user.name.split(' ')[0]}</h1>
          <p>Here are the people you’ve been asked to help. Please keep details private.</p>
        </div>
        {prof && (
          <Link to="/volunteer/profile" className="card" style={{ padding: '10px 14px', color: 'inherit' }}>
            <div className="tiny faint">Current load</div>
            <div className="row" style={{ gap: 8 }}><b>{prof.profile.load} of {prof.profile.max_load}</b><span className="small muted">active assignments</span></div>
          </Link>
        )}
      </div>

      {loading && !data ? <Loading /> : (
        <>
          <section className="card">
            <div className="card-head"><h2>Waiting for your reply</h2>{offers.length > 0 && <span className="badge warn">{offers.length} new</span>}</div>
            {offers.length === 0
              ? <Empty icon="📭" title="No new requests">When a coordinator asks for your help, it will appear here.</Empty>
              : offers.map((a) => <Item key={a.id} a={a} meta={meta} now={now} />)}
          </section>
          <section className="card">
            <div className="card-head"><h2>In progress</h2></div>
            {active.length === 0
              ? <Empty icon="🌿" title="Nothing in progress">Accepted assignments will show here so you can post updates.</Empty>
              : active.map((a) => <Item key={a.id} a={a} meta={meta} now={now} />)}
          </section>
          {past.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>History</h2></div>
              {past.map((a) => <Item key={a.id} a={a} meta={meta} now={now} />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Item({ a, meta, now }) {
  const quiet = now - a.last_update_at;
  const nudge = ['accepted', 'contacted', 'helping'].includes(a.status) && quiet > 3 * 86_400_000;
  return (
    <Link to={`/volunteer/assignments/${a.id}`} className="req-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
      <div>
        <div className="title"><Category cat={a.category} meta={meta} /><Urgency level={a.urgency} />{a.area && <span className="tiny faint row" style={{ gap: 3 }}><Icon name="map" size={12} />{a.area}</span>}</div>
        <div className="sum">{a.brief}</div>
        <div className="tiny faint" style={{ marginTop: 4 }}>
          {a.status === 'offered' ? `Asked ${relTime(a.created_at, now)}` : `Last update ${relTime(a.last_update_at, now)}`}
          {nudge && <span style={{ color: 'var(--warn)', fontWeight: 600 }}> · A quick update would be appreciated</span>}
        </div>
      </div>
      <AssignmentStatus status={a.status} label={a.status_label} />
    </Link>
  );
}
