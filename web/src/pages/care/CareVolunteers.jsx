import { Link } from 'react-router-dom';
import { useApp, useData } from '../../context.js';
import { relTime, initials } from '../../format.js';
import { AssignmentStatus, CAT_ICON, Empty, Icon, Loading, LoadMeter } from '../../components/ui.jsx';

const DAY_LABEL = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' };

export default function CareVolunteers() {
  const { meta, now } = useApp();
  const { data } = useData('/care/volunteers');
  if (!data) return <Loading />;
  const vols = data.volunteers;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1>Volunteers</h1><p>Skills, availability and current load. AI matching uses this to avoid overloading the same people.</p></div>
      </div>
      {vols.length === 0 ? <Empty title="No volunteers yet" /> : (
        <div className="grid-2">
          {vols.map((v) => (
            <div key={v.id} className="card card-pad stack-sm">
              <div className="spread">
                <div className="row" style={{ gap: 10 }}>
                  <span className="avatar lg">{initials(v.name)}</span>
                  <div><b>{v.name}</b><div className="tiny faint">{v.area} · {v.phone}{v.has_vehicle ? ' · 🚗' : ''}</div></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <LoadMeter load={v.load} max={v.max_load} />
                  <div className={`tiny ${v.load >= v.max_load ? '' : 'faint'}`} style={{ color: v.load >= v.max_load ? 'var(--warn)' : undefined, marginTop: 3 }}>
                    {v.max_load === 0 ? 'On a break' : v.load >= v.max_load ? 'At capacity' : `${v.load}/${v.max_load} active`}
                  </div>
                </div>
              </div>
              {v.bio && <p className="small muted">{v.bio}</p>}
              <div className="row" style={{ gap: 6 }}>{v.skills.map((s) => <span key={s} className="badge neutral">{CAT_ICON[s]} {meta.categories[s]}</span>)}</div>
              <div className="row small muted" style={{ gap: 8 }}>
                <span className="row" style={{ gap: 2 }}>{meta.days.map((d) => (
                  <span key={d} style={{ width: 20, height: 20, borderRadius: 4, display: 'inline-grid', placeItems: 'center', fontSize: 11, fontWeight: 700, background: v.availability_days.includes(d) ? 'var(--primary-soft)' : 'var(--surface-2)', color: v.availability_days.includes(d) ? 'var(--primary)' : 'var(--text-3)' }}>{DAY_LABEL[d]}</span>
                ))}</span>
                <span>{v.availability_note}</span>
              </div>
              {v.assignments.length > 0 && (
                <div className="stack-sm" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  {v.assignments.map((a) => (
                    <Link key={a.id} to={`/care/requests/${a.request_id}`} className="spread small" style={{ color: 'inherit' }}>
                      <span>{CAT_ICON[a.category]} Request #{a.request_id} <span className="faint">· updated {relTime(a.last_update_at, now)}</span></span>
                      <AssignmentStatus status={a.status} label={a.label} />
                    </Link>
                  ))}
                </div>
              )}
              <div className="tiny faint row" style={{ gap: 12 }}><span><Icon name="check" size={11} /> {v.completed} completed</span><span>{v.declined} declined</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
