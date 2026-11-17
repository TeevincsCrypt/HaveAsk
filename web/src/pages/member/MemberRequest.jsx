import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { post } from '../../api.js';
import { useApp, useData } from '../../context.js';
import { fmtDate, relTime } from '../../format.js';
import { Category, Empty, Icon, Loading, Status, Urgency, useToast } from '../../components/ui.jsx';

const STEPS = [['pending', 'Received'], ['in_progress', 'In progress'], ['resolved', 'Resolved']];

export default function MemberRequest() {
  const { id } = useParams();
  const { meta, now, bump } = useApp();
  const toast = useToast();
  const { data, error, loading, reload } = useData(`/my/requests/${id}`);
  const [fb, setFb] = useState({ rating: '', comment: '' });
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  if (loading && !data) return <Loading />;
  if (error && !data) return <Empty icon="🔍" title="Request not found" action={<Link className="btn" to="/member">Back</Link>} />;
  const { request: r, timeline, feedback } = data;
  const idx = r.status === 'closed' ? -1 : STEPS.findIndex(([s]) => s === r.status);

  const sendFeedback = async () => {
    try { await post(`/my/requests/${id}/feedback`, fb); toast('Thank you for letting us know.'); reload(); } catch (e) { toast(e.message); }
  };
  const withdraw = async () => {
    try { await post(`/my/requests/${id}/withdraw`); toast('Your request has been closed.'); bump(); } catch (e) { toast(e.message); }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <div className="crumbs"><Link to="/member">My requests</Link> / Request</div>
        <div className="spread">
          <h1><Category cat={r.category} meta={meta} /></h1>
          <Status status={r.status} />
        </div>
      </div>

      <div className="card card-pad stack">
        {r.status === 'closed'
          ? <p className="muted">This request is closed.</p>
          : (
            <div className="status-steps" aria-label="Request progress">
              {STEPS.map(([s, l], i) => <div key={s} className={i <= idx ? 'done' : ''}>{l}</div>)}
            </div>
          )}
        {r.status === 'in_progress' && r.helper_first_name && (
          <div className="privacy-box"><Icon name="heart" size={18} /><span><b>{r.helper_first_name}</b> from the care team is helping with this request and will be in touch by {meta.contactMethods[r.contact_method].toLowerCase()}.</span></div>
        )}
        {r.status === 'pending' && (
          <p className="muted small">Our care coordinator has your request and is arranging the right person to help. You don’t need to do anything.</p>
        )}
      </div>

      {['resolved', 'closed'].includes(r.status) && (
        <div className="card card-pad stack">
          <h2>Was the help useful?</h2>
          {feedback ? (
            <div className="success">Thank you — you told us: <b>{feedback.rating === 'yes' ? 'Yes, it helped' : feedback.rating === 'somewhat' ? 'Somewhat' : 'Not really'}</b>{feedback.comment ? ` — “${feedback.comment}”` : ''}</div>
          ) : (
            <>
              <p className="muted small">Completely optional. Your answer goes only to the care coordinator and helps us care better.</p>
              <div className="seg">
                {[['yes', 'Yes, it helped'], ['somewhat', 'Somewhat'], ['no', 'Not really']].map(([k, l]) => (
                  <button key={k} type="button" className={fb.rating === k ? 'on' : ''} onClick={() => setFb({ ...fb, rating: k })}>{l}</button>
                ))}
              </div>
              <textarea className="textarea" style={{ minHeight: 70 }} placeholder="Anything you’d like to share? (optional)" value={fb.comment} onChange={(e) => setFb({ ...fb, comment: e.target.value })} />
              <div><button className="btn primary" disabled={!fb.rating} onClick={sendFeedback}>Send</button></div>
            </>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-head"><h2>Your request</h2><Urgency level={r.urgency} prefix="Urgency: " /></div>
        <div className="card-body stack">
          <div className="quote">{r.description}</div>
          <dl className="kv">
            <dt>Submitted</dt><dd>{fmtDate(r.created_at)}</dd>
            <dt>Contact by</dt><dd>{meta.contactMethods[r.contact_method]}{r.contact_detail ? ` · ${r.contact_detail}` : ''}</dd>
            {r.followup_availability && <><dt>Available</dt><dd>{r.followup_availability}</dd></>}
          </dl>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Updates</h2></div>
        <div className="card-body">
          <ul className="timeline">
            {timeline.slice().reverse().map((t) => (
              <li key={t.id} className="good"><div>{t.message}</div><div className="when">{relTime(t.created_at, now)}</div></li>
            ))}
          </ul>
        </div>
      </div>

      {['pending', 'in_progress'].includes(r.status) && (
        <div className="spread small muted">
          <span>No longer need help? You can close this request at any time.</span>
          {confirmWithdraw
            ? <span className="row"><button className="btn danger sm" onClick={withdraw}>Yes, close my request</button><button className="btn ghost sm" onClick={() => setConfirmWithdraw(false)}>Cancel</button></span>
            : <button className="btn sm" onClick={() => setConfirmWithdraw(true)}>I no longer need help</button>}
        </div>
      )}
    </div>
  );
}
