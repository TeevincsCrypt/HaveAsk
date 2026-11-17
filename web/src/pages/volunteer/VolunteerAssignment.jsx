import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { post } from '../../api.js';
import { useApp, useData } from '../../context.js';
import { relTime } from '../../format.js';
import { AssignmentStatus, Category, Empty, Icon, Loading, Modal, Urgency, useToast } from '../../components/ui.jsx';

const STATUS_OPTS = [
  ['contacted', 'I’ve contacted them', 'Made first contact with the person'],
  ['helping', 'Helping', 'Help is under way'],
  ['needs_support', 'Needs more support', 'More than I can give — please involve the coordinator'],
  ['completed', 'Completed', 'The need has been met'],
];

export default function VolunteerAssignment() {
  const { id } = useParams();
  const { meta, now, bump } = useApp();
  const toast = useToast();
  const { data, error, loading, reload } = useData(`/vol/assignments/${id}`);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loading />;
  if (error && !data) return <Empty icon="🔍" title="Assignment not found" action={<Link className="btn" to="/volunteer">Back</Link>} />;
  const { assignment: a, updates } = data;
  const act = async (fn, msg) => { setBusy(true); try { await fn(); toast(msg); reload(); bump(); } catch (e) { toast(e.message); } finally { setBusy(false); } };
  const isActive = ['accepted', 'contacted', 'helping', 'needs_support'].includes(a.status);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <div className="crumbs"><Link to="/volunteer">My assignments</Link> / Assignment</div>
        <div className="spread">
          <h1><Category cat={a.category} meta={meta} /></h1>
          <AssignmentStatus status={a.status} label={a.status_label} />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>What’s needed</h2>
          <div className="row"><Urgency level={a.urgency} />{a.area && <span className="badge neutral"><Icon name="map" size={12} />{a.area}</span>}</div>
        </div>
        <div className="card-body stack">
          <p style={{ fontSize: 16 }}>{a.brief}</p>
          {a.status === 'offered' && (
            <div className="privacy-box"><Icon name="lock" size={18} /><span>Contact details and the full request are shared once you accept. If you can’t help right now, that’s completely okay — just let us know.</span></div>
          )}
          {a.description && (
            <>
              <div className="divider" />
              <div className="stack-sm">
                <span className="label">In {a.member_first_name}’s words</span>
                <div className="quote">{a.description}</div>
              </div>
              <dl className="kv">
                <dt>Name</dt><dd>{a.member_name}</dd>
                <dt>Preferred contact</dt><dd><b>{meta.contactMethods[a.contact_method]}</b>{a.contact_detail ? ` · ${a.contact_detail}` : ''}</dd>
                {a.followup_availability && <><dt>Best times</dt><dd>{a.followup_availability}</dd></>}
              </dl>
              <p className="tiny faint">Please keep these details confidential and use them only for this request.</p>
            </>
          )}
        </div>
      </div>

      {a.status === 'offered' && (
        <div className="card card-pad spread">
          <div><h3>Can you help?</h3><p className="small muted">Asked {relTime(a.created_at, now)} by the care coordinator.</p></div>
          <div className="row">
            <button className="btn" onClick={() => setDeclining(true)} disabled={busy}>I can’t this time</button>
            <button className="btn primary" disabled={busy} onClick={() => act(() => post(`/vol/assignments/${id}/respond`, { accept: true }), 'Thank you! Contact details are now available.')}>
              <Icon name="check" />Accept assignment
            </button>
          </div>
        </div>
      )}

      {isActive && (
        <div className="card card-pad stack">
          <div><h2>Post an update</h2><p className="small muted">A quick update helps the coordinator know the person is cared for. Last update {relTime(a.last_update_at, now)}.</p></div>
          <div className="choice-grid">
            {STATUS_OPTS.map(([k, l, h]) => (
              <button key={k} type="button" className={`choice ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}><b>{l}</b><span>{h}</span></button>
            ))}
          </div>
          <textarea className="textarea" style={{ minHeight: 80 }} placeholder="Optional note for the coordinator (e.g. “Delivered groceries, will check in again Friday”)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div>
            <button className="btn primary" disabled={!status || busy} onClick={() => act(async () => { await post(`/vol/assignments/${id}/status`, { status, note }); setStatus(''); setNote(''); }, 'Update shared with the coordinator. Thank you!')}>
              Share update
            </button>
          </div>
        </div>
      )}

      {updates.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Your updates</h2></div>
          <div className="card-body">
            <ul className="timeline">
              {updates.slice().reverse().map((u, i) => <li key={i} className="good"><div>{u.message}</div><div className="when">{relTime(u.created_at, now)}</div></li>)}
            </ul>
          </div>
        </div>
      )}

      {declining && (
        <Modal title="Decline this assignment" onClose={() => setDeclining(false)}
          footer={<>
            <button className="btn ghost" onClick={() => setDeclining(false)}>Cancel</button>
            <button className="btn primary" disabled={busy} onClick={() => act(async () => { await post(`/vol/assignments/${id}/respond`, { accept: false, reason }); setDeclining(false); }, 'Thanks for letting us know. The coordinator will find someone else.')}>Decline</button>
          </>}>
          <div className="stack-sm">
            <p className="muted">No problem at all — the coordinator will find someone else. A short reason helps them plan (optional).</p>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Away this week" autoFocus />
          </div>
        </Modal>
      )}
    </div>
  );
}
