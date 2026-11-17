import { Link, useNavigate } from 'react-router-dom';
import { post } from '../api.js';
import { useApp } from '../context.js';
import { duration, relTime } from '../format.js';
import { Category, Icon, Severity, Status, Urgency, useToast } from './ui.jsx';

export function AlertItem({ a, showRequest = true, onChange }) {
  const { now, bump } = useApp();
  const toast = useToast();
  const nav = useNavigate();
  const act = async (action, body, msg) => {
    try { await post(`/care/alerts/${a.id}/${action}`, body); toast(msg); bump(); onChange?.(); } catch (e) { toast(e.message); }
  };
  const resolved = a.status === 'resolved';
  return (
    <div className={`alert-item ${a.severity} ${a.status}`}>
      <span className="bar" />
      <div>
        <div className="alert-title">
          <Severity severity={a.severity} />
          <span>{a.rule_label}</span>
          {showRequest && <Link to={`/care/requests/${a.request_id}`} className="small" style={{ fontWeight: 500 }}>#{a.request_id} · {a.member_name}</Link>}
          {a.status === 'acknowledged' && <span className="badge neutral">Acknowledged</span>}
          {a.status === 'snoozed' && <span className="badge neutral">Snoozed until {new Date(a.snoozed_until).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
          {resolved && <span className="badge ok">Resolved · {a.resolved_reason}</span>}
        </div>
        <div className="alert-sum">{a.summary}</div>
        {!resolved && <div className="next-step"><Icon name="arrow" size={13} />Recommended: {a.recommended_action}</div>}
        <div className="tiny faint" style={{ marginTop: 6 }}>Flagged by the care monitor {relTime(a.created_at, now)}</div>
      </div>
      {!resolved && (
        <div className="alert-actions">
          {showRequest && <button className="btn primary sm" onClick={() => nav(`/care/requests/${a.request_id}`)}>Take action</button>}
          {a.status === 'open' && <button className="btn sm" onClick={() => act('acknowledge', {}, 'Alert acknowledged — it stays visible until the issue is resolved.')}>Acknowledge</button>}
          <button className="btn ghost sm" onClick={() => act('snooze', { days: 1 }, 'Snoozed for 1 day.')}>Snooze 1d</button>
          <button className="btn ghost sm" title="Dismiss if this isn't actually a concern" onClick={() => act('dismiss', {}, 'Alert dismissed.')}><Icon name="x" size={14} /></button>
        </div>
      )}
    </div>
  );
}

export function AgeIndicator({ r, staleDays = 5 }) {
  const { now } = useApp();
  const open = ['pending', 'in_progress'].includes(r.status);
  const age = now - r.created_at;
  const idle = now - r.last_activity_at;
  const cls = !open ? '' : idle > 2 * staleDays * 86_400_000 || r.top_severity === 'critical' ? 'very-old' : idle > staleDays * 86_400_000 || r.top_severity === 'warning' ? 'old' : '';
  const pct = Math.min(100, (age / (14 * 86_400_000)) * 100);
  return (
    <span className={`age ${cls}`} title={`Open ${duration(age)}; last activity ${duration(idle)} ago`}>
      <b>{duration(age)}</b>
      <span className="faint">{open ? `idle ${duration(idle)}` : 'closed'}</span>
      {open && <span className="age-meter"><i style={{ width: `${Math.max(6, pct)}%` }} /></span>}
    </span>
  );
}

export function RequestRow({ r }) {
  const { meta } = useApp();
  return (
    <Link to={`/care/requests/${r.id}`} className="req-row">
      <span className={`flag ${r.top_severity || ''}`} />
      <div>
        <div className="title">
          <span className="faint mono">#{r.id}</span>
          <span>{r.member_name}</span>
          {r.safeguarding && <span className="badge crit"><Icon name="shield" size={12} />Safeguarding</span>}
          {r.escalated && <span className="badge crit"><Icon name="flag" size={12} />Escalated</span>}
          {r.alert_count > 0 && <span className={`badge ${r.top_severity === 'critical' ? 'crit' : 'warn'}`}><Icon name="alert" size={12} />{r.alert_count} alert{r.alert_count > 1 ? 's' : ''}</span>}
        </div>
        <div className="sum">{r.summary}</div>
      </div>
      <div className="stack-sm hide-sm" style={{ gap: 4 }}>
        <Category cat={r.category} meta={meta} />
        <Urgency level={r.ai_urgency} />
      </div>
      <div className="stack-sm hide-sm" style={{ gap: 4 }}>
        <Status status={r.status} />
        {r.assignment
          ? <span className="small muted">{r.assignment.volunteer_name} · {r.assignment.label.toLowerCase()}</span>
          : r.status === 'pending' && r.pending_suggestions > 0
            ? <span className="small" style={{ color: 'var(--ai)', fontWeight: 600 }}><Icon name="sparkle" size={12} /> {r.pending_suggestions} AI suggestion{r.pending_suggestions > 1 ? 's' : ''} to review</span>
            : ['pending', 'in_progress'].includes(r.status) && <span className="small muted">Unassigned</span>}
      </div>
      <AgeIndicator r={r} />
    </Link>
  );
}
