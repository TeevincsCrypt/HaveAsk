import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { post } from '../../api.js';
import { useApp, useData } from '../../context.js';
import { fmtDate, relTime, initials } from '../../format.js';
import { AlertItem } from '../../components/care.jsx';
import { PaymentRow, SendPaymentModal, usePay } from '../../components/payments.jsx';
import {
  AIBadge, AssignmentStatus, Category, Confidence, Empty, Icon, Loading, LoadMeter, Modal, Status, Urgency, useToast,
} from '../../components/ui.jsx';

export default function CareRequestDetail() {
  const { id } = useParams();
  const { meta, now, bump, user } = useApp();
  const toast = useToast();
  const { data, error, loading, reload } = useData(`/care/requests/${id}`);
  const [assignTo, setAssignTo] = useState(null); // { volunteer, suggestion }
  const [brief, setBrief] = useState('');
  const [modal, setModal] = useState(null); // 'resolve' | 'close' | 'escalate' | 'contacted'
  const [modalText, setModalText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [manualId, setManualId] = useState('');
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const { pay, busyId } = usePay();

  if (loading && !data) return <Loading />;
  if (error && !data) return <Empty icon="🔍" title="Request not found" action={<Link className="btn" to="/care/requests">Back to requests</Link>} />;
  const { request: r, suggestions, assignments, notes, activity, alerts, feedback, volunteers, payments = [], member_has_wallet } = data;
  const payees = [
    { id: r.member_id, label: `${r.member_name} (member) — financial help`, kind: 'financial_help', wallet: member_has_wallet },
    ...[...new Map(assignments.filter((a) => ['accepted', 'contacted', 'helping', 'needs_support', 'completed'].includes(a.status))
      .map((a) => [a.volunteer_id, { id: a.volunteer_id, label: `${a.volunteer_name} (volunteer)`, kind: 'reimbursement', wallet: !!a.volunteer_has_wallet }])).values()],
  ];
  const ai = r.ai || {};
  const open = ['pending', 'in_progress'].includes(r.status);
  const active = assignments.find((a) => ['offered', 'accepted', 'contacted', 'helping', 'needs_support'].includes(a.status));
  const volSugg = suggestions.filter((s) => s.kind === 'volunteer');
  const resSugg = suggestions.filter((s) => s.kind === 'resource');
  const activeAlerts = alerts.filter((a) => a.status !== 'resolved');

  const act = async (fn, msg) => {
    setBusy(true);
    try { await fn(); toast(msg); reload(); bump(); return true; } catch (e) { toast(e.message); return false; } finally { setBusy(false); }
  };
  const openAssign = (volunteer, suggestion = null) => { setAssignTo({ volunteer, suggestion }); setBrief(ai.volunteer_brief || ''); };
  const confirmAssign = () => act(async () => {
    await post(`/care/requests/${id}/assign`, { volunteer_id: assignTo.volunteer.id, suggestion_id: assignTo.suggestion?.id, brief });
    setAssignTo(null); setManualId('');
  }, `Sent to ${assignTo.volunteer.name}. They’ll be asked to accept or decline.`);
  const doModal = () => act(async () => {
    if (modal === 'resolve' || modal === 'close') await post(`/care/requests/${id}/status`, { status: modal === 'resolve' ? 'resolved' : 'closed', note: modalText });
    if (modal === 'escalate') await post(`/care/requests/${id}/escalate`, { reason: modalText });
    if (modal === 'contacted') await post(`/care/requests/${id}/contacted`, { note: modalText });
    setModal(null); setModalText('');
  }, { resolve: 'Request resolved. The member will get a gentle check-in.', close: 'Request closed.', escalate: 'Escalated to the pastoral team.', contacted: 'Contact with member logged.' }[modal]);

  const urgencyRaised = ai.suggested_urgency && ai.suggested_urgency !== r.urgency;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <div className="crumbs"><Link to="/care/requests">Requests</Link> / #{r.id}</div>
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <div className="row" style={{ gap: 14 }}>
            <span className="avatar lg">{initials(r.member_name)}</span>
            <div>
              <h1 style={{ fontSize: 24 }}>{r.member_name} <span className="faint mono" style={{ fontSize: 18 }}>#{r.id}</span></h1>
              <div className="row small muted" style={{ gap: 10, marginTop: 4 }}>
                <Category cat={r.category} meta={meta} /> · <span>{r.area || 'Area not given'}</span> · <span>Submitted {relTime(r.created_at, now)}</span>
              </div>
            </div>
          </div>
          <div className="row">
            {r.escalated && <span className="badge crit"><Icon name="flag" size={12} />Escalated</span>}
            <Urgency level={r.urgency} prefix="Member: " />
            <Status status={r.status} />
          </div>
        </div>
      </div>

      {activeAlerts.length > 0 && (
        <section className="card alert-panel">
          <div className="card-head"><h2 className="row" style={{ gap: 8, color: 'var(--crit)' }}><Icon name="alert" size={18} />This request needs attention</h2></div>
          {activeAlerts.map((a) => <AlertItem key={a.id} a={a} showRequest={false} onChange={reload} />)}
        </section>
      )}

      <div className="detail-grid">
        <div className="stack" style={{ gap: 20 }}>
          <section className="card">
            <div className="card-head"><h2>Request</h2><span className="badge neutral"><Icon name="lock" size={12} />Private — care team only</span></div>
            <div className="card-body stack">
              <div className="quote">{r.description}</div>
              <dl className="kv">
                <dt>Contact by</dt><dd><b>{meta.contactMethods[r.contact_method]}</b>{r.contact_detail ? ` · ${r.contact_detail}` : ''}</dd>
                <dt>Follow-up</dt><dd>{r.followup_availability || <span className="faint">Not specified</span>}</dd>
                <dt>Member contact</dt><dd>{r.member_phone || '—'} · {r.member_email}</dd>
                <dt>Last contact</dt><dd>{r.last_member_contact_at ? relTime(r.last_member_contact_at, now) : <span style={{ color: 'var(--warn)', fontWeight: 600 }}>No one has contacted {r.member_name.split(' ')[0]} yet</span>}</dd>
                <dt>Submitted</dt><dd>{fmtDate(r.created_at)}</dd>
              </dl>
              {feedback && <div className={feedback.rating === 'no' ? 'error' : 'success'}>Member feedback: <b>{feedback.rating === 'yes' ? 'The help was useful' : feedback.rating === 'somewhat' ? 'Somewhat useful' : 'Not useful'}</b>{feedback.comment ? ` — “${feedback.comment}”` : ''}</div>}
            </div>
          </section>

          <section className="ai-panel">
            <div className="card-head">
              <div className="stack-sm" style={{ gap: 2 }}>
                <AIBadge>AI analysis · suggestion</AIBadge>
                <span className="tiny faint">{ai.source === 'claude' ? 'Generated by Claude' : ai.source === 'demo' ? 'Demo data' : 'Rule-based analyzer'} · review before acting</span>
              </div>
              <button className="btn ghost sm" disabled={busy} onClick={() => act(() => post(`/care/requests/${id}/reanalyze`), 'AI analysis refreshed.')}><Icon name="refresh" size={14} />Re-run</button>
            </div>
            <div className="card-body stack">
              {ai.safeguarding && (
                <div className="error" style={{ display: 'flex', gap: 10 }}>
                  <Icon name="shield" size={18} />
                  <div><b>Possible safeguarding concern.</b> {ai.safeguarding_note || 'A pastor should reach out personally.'} No volunteers have been suggested for this request.</div>
                </div>
              )}
              <p style={{ fontSize: 15 }}>{ai.summary}</p>
              <div className="grid-2">
                <div className="stack-sm">
                  <span className="label small">Categories</span>
                  <div className="row" style={{ gap: 6 }}>{(ai.categories || []).map((c) => <span key={c} className="badge ai">{meta.categories[c]}</span>)}</div>
                  <span className="label small" style={{ marginTop: 6 }}>Suggested urgency</span>
                  <div className="row" style={{ gap: 6 }}>
                    <Urgency level={ai.suggested_urgency} />
                    {urgencyRaised && <span className="tiny faint">Member selected {r.urgency}</span>}
                  </div>
                </div>
                <div className="stack-sm">
                  <span className="label small">Key needs</span>
                  <ul className="needs small">{(ai.key_needs || []).map((n, i) => <li key={i}>{n}</li>)}</ul>
                </div>
              </div>
              {ai.urgency_signals?.length > 0 && (
                <div className="stack-sm">
                  <span className="label small">Urgency signals detected</span>
                  <ul className="reasons">{ai.urgency_signals.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
            </div>
          </section>

          <section className="ai-panel">
            <div className="card-head">
              <div className="stack-sm" style={{ gap: 2 }}>
                <AIBadge>Suggested matches</AIBadge>
                <span className="tiny faint">Based on skills, availability, current load and distance. Nobody is contacted until you approve.</span>
              </div>
            </div>
            <div className="card-body stack-sm">
              {volSugg.length === 0 && resSugg.length === 0 && <p className="small muted">{ai.safeguarding ? 'Suggestions are withheld for safeguarding concerns — please respond personally.' : 'No suitable matches found. Try assigning manually.'}</p>}
              {volSugg.map((s) => {
                const isActive = active?.volunteer_id === s.volunteer_id;
                return (
                  <div key={s.id} className={`match ${s.status}`}>
                    <div className="spread">
                      <div className="row" style={{ gap: 10 }}>
                        <span className="avatar">{initials(s.volunteer_name)}</span>
                        <div><b>{s.volunteer_name}</b><div className="tiny faint">{s.volunteer_area} · <LoadMeter load={s.load} max={s.max_load} /> {s.load}/{s.max_load} active</div></div>
                      </div>
                      <Confidence score={s.score} />
                    </div>
                    <ul className="reasons">{s.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      {s.status === 'approved' && <span className="badge ok"><Icon name="check" size={12} />Approved by coordinator{isActive ? '' : ' (earlier)'}</span>}
                      {s.status === 'dismissed' && <span className="badge neutral">Dismissed / declined</span>}
                      {s.status === 'suggested' && open && <>
                        <button className="btn ghost sm" onClick={() => act(() => post(`/care/requests/${id}/suggestions/${s.id}/dismiss`), 'Suggestion dismissed.')}>Dismiss</button>
                        <button className="btn ai sm" onClick={() => openAssign({ id: s.volunteer_id, name: s.volunteer_name }, s)}><Icon name="check" size={14} />{active ? 'Approve & reassign' : 'Approve & send'}</button>
                      </>}
                    </div>
                  </div>
                );
              })}
              {resSugg.map((s) => (
                <div key={s.id} className="match">
                  <div className="spread">
                    <div><span className="badge neutral" style={{ marginBottom: 4 }}>Community resource</span><div><b>{s.resource_name}</b></div><div className="tiny faint">{s.resource_contact} · {s.resource_hours}</div></div>
                    <Confidence score={s.score} />
                  </div>
                  <span className="small muted">{s.resource_description}</span>
                  <ul className="reasons">{s.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div><h2>Payments</h2><p>USDC to the member or a volunteer. Approved and signed by you.</p></div>
              <button className="btn sm" onClick={() => setPaying(true)}><Icon name="wallet" size={14} />Send payment</button>
            </div>
            <div className="card-body">
              {payments.length === 0 ? <p className="small muted">No payments on this request.</p> : payments.map((p) => (
                <PaymentRow key={p.id} p={p} actions={
                  p.status === 'requested' ? <button className="btn sm" onClick={() => act(() => post(`/care/payments/${p.id}/approve`), 'Approved. Now sign it to send.')}>Approve</button>
                  : (p.status === 'approved' || p.status === 'failed') ? <button className="btn primary sm" disabled={busyId === p.id} onClick={() => pay(p)}>{busyId === p.id ? 'Sending…' : 'Sign & send'}</button>
                  : null} />
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Assignments</h2></div>
            <div className="card-body stack-sm">
              {assignments.length === 0 ? <p className="small muted">No volunteer has been asked yet.</p> : assignments.map((a) => (
                <div key={a.id} className="spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className="row" style={{ gap: 10 }}>
                    <span className="avatar">{initials(a.volunteer_name)}</span>
                    <div>
                      <b>{a.volunteer_name}</b>
                      <div className="tiny faint">Asked {relTime(a.created_at, now)} · last update {relTime(a.last_update_at, now)}{a.volunteer_phone ? ` · ${a.volunteer_phone}` : ''}</div>
                      {a.decline_reason && <div className="tiny muted">“{a.decline_reason}”</div>}
                    </div>
                  </div>
                  <AssignmentStatus status={a.status} label={a.label} />
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="stack" style={{ gap: 20 }}>
          <section className="card">
            <div className="card-head"><h2>Actions</h2></div>
            <div className="card-body stack">
              {open ? (
                <>
                  <div className="field">
                    <label htmlFor="manual" className="small">{active ? 'Reassign to' : 'Assign manually'}</label>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <select id="manual" className="select" value={manualId} onChange={(e) => setManualId(e.target.value)}>
                        <option value="">Choose a volunteer…</option>
                        {volunteers.filter((v) => v.active && v.id !== active?.volunteer_id).map((v) => (
                          <option key={v.id} value={v.id}>{v.name} — {v.load}/{v.max_load} active{v.load >= v.max_load ? ' (at capacity)' : ''}</option>
                        ))}
                      </select>
                      <button className="btn" disabled={!manualId} onClick={() => openAssign(volunteers.find((v) => v.id === Number(manualId)))}>Send</button>
                    </div>
                  </div>
                  <div className="divider" />
                  <button className="btn block" onClick={() => setModal('contacted')}><Icon name="phone" />Log contact with member</button>
                  <button className="btn block" onClick={() => setModal('escalate')}><Icon name="flag" />{r.escalated ? 'Remove escalation' : 'Escalate to pastor'}</button>
                  <button className="btn primary block" onClick={() => setModal('resolve')}><Icon name="check" />Mark resolved</button>
                  <button className="btn ghost block" onClick={() => setModal('close')}>Close without resolving</button>
                </>
              ) : (
                <>
                  <p className="small muted">This request is {r.status}{r.resolved_at ? ` (${relTime(r.resolved_at, now)})` : ''}.</p>
                  <button className="btn block" onClick={() => act(() => post(`/care/requests/${id}/status`, { status: 'in_progress' }), 'Request reopened.')}>Reopen request</button>
                </>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Notes</h2><span className="tiny faint">Private to the care team</span></div>
            <div className="card-body stack-sm">
              <textarea className="textarea" style={{ minHeight: 70 }} placeholder="Add a private note…" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
              <div><button className="btn sm" disabled={!noteText.trim() || busy} onClick={() => act(async () => { await post(`/care/requests/${id}/notes`, { body: noteText }); setNoteText(''); }, 'Note added.')}>Add note</button></div>
              {notes.map((n) => (
                <div key={n.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <div className="small">{n.body}</div>
                  <div className="tiny faint">{n.author_name}{n.author_id === user.id ? ' (you)' : ''} · {relTime(n.created_at, now)}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Activity</h2></div>
            <div className="card-body">
              <ul className="timeline">
                {activity.filter((a) => a.type !== 'member_status').map((a) => (
                  <li key={a.id} className={a.type.startsWith('ai') ? 'ai' : a.type.startsWith('alert') ? 'alert' : ['accepted', 'resolved', 'volunteer_update', 'member_contacted'].includes(a.type) ? 'good' : ''}>
                    <div className="small">{a.type.startsWith('ai') && <AIBadge>AI</AIBadge>} {a.message}</div>
                    <div className="when">{relTime(a.created_at, now)}</div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </aside>
      </div>

      {assignTo && (
        <Modal title={`Send to ${assignTo.volunteer.name}?`} onClose={() => setAssignTo(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setAssignTo(null)}>Cancel</button>
            <button className="btn primary" disabled={busy || !brief.trim()} onClick={confirmAssign}><Icon name="check" />Approve & notify volunteer</button>
          </>}>
          <div className="stack">
            {assignTo.suggestion && <div className="ai-disclaimer"><Icon name="sparkle" size={14} style={{ color: 'var(--ai)' }} /><span>You’re approving an AI suggestion ({assignTo.suggestion.score}% match). You make the final decision.</span></div>}
            {active && <div className="error small">This will withdraw the request from {active.volunteer_name} and thank them for their help.</div>}
            <div className="field">
              <label htmlFor="brief">What {assignTo.volunteer.name.split(' ')[0]} will see</label>
              <textarea id="brief" className="textarea" style={{ minHeight: 90 }} value={brief} onChange={(e) => setBrief(e.target.value)} />
              <span className="hint">Only what they need to know. {r.member_name.split(' ')[0]}’s contact details and full message are shared only after they accept.</span>
            </div>
          </div>
        </Modal>
      )}

      {paying && <SendPaymentModal request={r} payees={payees} onClose={() => { setPaying(false); reload(); }} />}

      {modal && (
        <Modal
          title={{ resolve: 'Mark this request resolved', close: 'Close this request', escalate: r.escalated ? 'Remove escalation' : 'Escalate to the pastoral team', contacted: 'Log contact with member' }[modal]}
          onClose={() => setModal(null)}
          footer={<><button className="btn ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn primary" disabled={busy} onClick={doModal}>Confirm</button></>}>
          <div className="stack-sm">
            <p className="muted small">{{
              resolve: `${r.member_name.split(' ')[0]} will receive one gentle, optional “Was the help useful?” check-in.`,
              close: 'Use this when help is no longer needed or was arranged elsewhere.',
              escalate: r.escalated ? 'The request will no longer be marked as escalated.' : 'The senior pastor will be notified and the request will be flagged as escalated.',
              contacted: 'Record that someone from the care team has spoken with the member. This clears the “member hasn’t heard from anyone” alert.',
            }[modal]}</p>
            {!(modal === 'escalate' && r.escalated) && (
              <textarea className="textarea" style={{ minHeight: 70 }} placeholder={modal === 'escalate' ? 'Why are you escalating? (optional)' : 'Optional note'} value={modalText} onChange={(e) => setModalText(e.target.value)} />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
