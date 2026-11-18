import { post } from '../../api.js';
import { useApp, useData } from '../../context.js';
import { initials } from '../../format.js';
import { Empty, Loading, useToast } from '../../components/ui.jsx';
import { short } from '../../components/payments.jsx';

const ROLES = [['member', 'Member'], ['volunteer', 'Volunteer'], ['coordinator', 'Care Coordinator'], ['admin', 'Pastor · Admin']];

export default function CarePeople() {
  const { user, bump } = useApp();
  const toast = useToast();
  const { data, reload } = useData('/care/people');
  if (!data) return <Loading />;
  const applicants = data.people.filter((p) => p.volunteer_status === 'applied');
  const isAdmin = user.role === 'admin';
  const setRole = async (p, role) => {
    try { await post(`/care/people/${p.id}/role`, { role }); toast(`${p.name} is now ${ROLES.find(([k]) => k === role)[1]}.`); reload(); bump(); } catch (e) { toast(e.message); }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1>People</h1><p>Everyone who has signed in. Coordinators can make someone a volunteer; only a pastor/admin can grant care-team access.</p></div>
      </div>

      {applicants.length > 0 && (
        <section className="card ai-panel">
          <div className="card-head"><h2>Volunteer applications</h2></div>
          <div className="card-body stack-sm">
            {applicants.map((p) => (
              <div key={p.id} className="spread">
                <div className="row" style={{ gap: 10 }}><span className="avatar">{initials(p.name)}</span><div><b>{p.name}</b><div className="tiny faint">{p.email}{p.area ? ` · ${p.area}` : ''}</div></div></div>
                <div className="row">
                  <button className="btn ghost sm" onClick={() => post(`/care/people/${p.id}/decline-volunteer`).then(reload)}>Not now</button>
                  <button className="btn primary sm" onClick={() => setRole(p, 'volunteer')}>Approve as volunteer</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        {data.people.length === 0 ? <Empty title="No one yet" /> : data.people.map((p) => (
          <div key={p.id} className="req-row" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1.2fr) 200px' }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="avatar">{initials(p.name)}</span>
              <div style={{ minWidth: 0 }}><b>{p.name}</b>{p.id === user.id && <span className="faint"> (you)</span>}
                <div className="tiny faint">{p.email}{!p.has_login && ' · demo account'}</div></div>
            </div>
            <div className="tiny muted hide-sm">{p.wallet_address ? <span className="mono">👛 {short(p.wallet_address)}</span> : 'No wallet yet'}</div>
            <select className="select" value={p.role} disabled={p.id === user.id} onChange={(e) => setRole(p, e.target.value)}>
              {ROLES.map(([k, l]) => <option key={k} value={k} disabled={!isAdmin && (k === 'coordinator' || k === 'admin' || p.role === 'coordinator' || p.role === 'admin')}>{l}</option>)}
            </select>
          </div>
        ))}
      </section>
    </div>
  );
}
