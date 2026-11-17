import { Link } from 'react-router-dom';
import { useApp, useData } from '../../context.js';
import { relTime } from '../../format.js';
import { Category, Empty, Icon, Loading, Status } from '../../components/ui.jsx';

export default function MemberHome() {
  const { user, meta, now } = useApp();
  const { data, loading } = useData('/my/requests');
  const reqs = data?.requests || [];
  const open = reqs.filter((r) => ['pending', 'in_progress'].includes(r.status));
  const past = reqs.filter((r) => !['pending', 'in_progress'].includes(r.status));

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head">
        <div>
          <h1>Hello, {user.name.split(' ')[0]}</h1>
          <p>You can ask for help privately at any time. Only our care coordinator and the volunteer helping you will see your request.</p>
        </div>
        <Link to="/member/new" className="btn primary lg"><Icon name="plus" />Ask for help</Link>
      </div>

      <div className="privacy-box">
        <Icon name="lock" size={18} />
        <span>Your requests are never shared with the wider church. Volunteers only see what they need to help, and only after a coordinator asks them.</span>
      </div>

      {loading && !data ? <Loading /> : (
        <>
          <section className="card">
            <div className="card-head"><h2>Current requests</h2></div>
            {open.length === 0
              ? <Empty icon="🕊️" title="No open requests">If something comes up — big or small — we’re here to help.</Empty>
              : open.map((r) => <RequestItem key={r.id} r={r} meta={meta} now={now} />)}
          </section>
          {past.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>Past requests</h2></div>
              {past.map((r) => <RequestItem key={r.id} r={r} meta={meta} now={now} />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function RequestItem({ r, meta, now }) {
  return (
    <Link to={`/member/requests/${r.id}`} className="req-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
      <div>
        <div className="title"><Category cat={r.category} meta={meta} /></div>
        <div className="sum">{r.description}</div>
        <div className="tiny faint" style={{ marginTop: 4 }}>
          Submitted {relTime(r.created_at, now)}{r.helper_first_name && r.status === 'in_progress' ? ` · ${r.helper_first_name} is helping` : ''}
        </div>
      </div>
      <Status status={r.status} />
    </Link>
  );
}
