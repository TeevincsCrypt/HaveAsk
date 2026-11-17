import { useEffect, useState } from 'react';
import { post, put } from '../../api.js';
import { useApp, useData } from '../../context.js';
import { fmtDate } from '../../format.js';
import { Icon, Loading, Modal, useToast } from '../../components/ui.jsx';

const FIELDS = [
  ['high_urgency_unassigned_hours', 'High-urgency request with no volunteer', 'hours'],
  ['offer_response_hours', 'Volunteer hasn’t accepted or declined', 'hours'],
  ['volunteer_silent_days', 'Accepted, but no progress update', 'days'],
  ['member_followup_days', 'Member hasn’t been contacted', 'days'],
  ['stale_days', 'Request with no activity at all', 'days'],
  ['reminder_cooldown_days', 'Minimum gap between reminders to the same volunteer', 'days'],
];

export default function CareSettings() {
  const { meta, now, bump } = useApp();
  const toast = useToast();
  const { data, reload } = useData('/care/settings');
  const { data: resData } = useData('/care/resources');
  const [s, setS] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => { if (data) setS(data.settings); }, [data]);
  if (!s) return <Loading />;

  const save = async () => {
    try { const r = await put('/care/settings', s); toast(`Saved. Monitor re-checked: ${r.stats.created} new, ${r.stats.cleared} cleared.`); bump(); reload(); } catch (e) { toast(e.message); }
  };
  const advance = async (days) => {
    const r = await post('/care/demo/advance', { days });
    toast(`Fast-forwarded ${days} day${days > 1 ? 's' : ''}. Monitor raised ${r.stats.created} new alert(s), sent ${r.stats.reminders} reminder(s).`);
    bump();
  };
  const reset = async () => { await post('/care/demo/reset'); setConfirmReset(false); toast('Demo data reset.'); bump(); reload(); };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head" style={{ marginBottom: 0 }}><div><h1>Settings & demo controls</h1><p>Tune when the care monitor raises an alert.</p></div></div>

      <section className="card">
        <div className="card-head"><div><h2>Unresolved-request thresholds</h2><p>Alerts appear on the dashboard when a request crosses one of these lines.</p></div></div>
        <div className="card-body stack">
          {FIELDS.map(([k, l, unit]) => (
            <div key={k} className="spread">
              <label htmlFor={k} className="small" style={{ fontWeight: 600 }}>{l}</label>
              <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                <input id={k} type="number" min="1" max="90" className="input" style={{ width: 90 }} value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
                <span className="small muted" style={{ width: 40 }}>{unit}</span>
              </div>
            </div>
          ))}
          <div className="row"><button className="btn primary" onClick={save}>Save thresholds</button><button className="btn ghost" onClick={() => setS({ ...data.defaults, clock_offset_ms: s.clock_offset_ms })}>Restore defaults</button></div>
        </div>
      </section>

      <section className="card" style={{ borderColor: '#c9c6e0' }}>
        <div className="card-head"><div><h2 className="row" style={{ gap: 8 }}><Icon name="clock" />Demo controls</h2><p>Simulate time passing to show the monitor flagging requests that go quiet.</p></div></div>
        <div className="card-body stack">
          <div className="small">Demo clock: <b>{fmtDate(now)}</b>{meta.clockOffsetMs ? ` (${Math.round(meta.clockOffsetMs / 8.64e6) / 10} days ahead of real time)` : ' (real time)'}</div>
          <div className="row">
            <button className="btn" onClick={() => advance(1)}><Icon name="fwd" />Fast-forward 1 day</button>
            <button className="btn" onClick={() => advance(3)}><Icon name="fwd" />Fast-forward 3 days</button>
            <button className="btn" onClick={() => advance(7)}><Icon name="fwd" />1 week</button>
          </div>
          <div className="divider" />
          <div className="spread">
            <span className="small muted">Restore the original synthetic demo data and reset the clock.</span>
            <button className="btn danger" onClick={() => setConfirmReset(true)}>Reset demo data</button>
          </div>
          <div className="small muted">AI mode: <b>{meta.aiMode === 'claude' ? 'Claude (live)' : 'Built-in rule-based analyzer'}</b>{meta.aiMode !== 'claude' && ' — set ANTHROPIC_API_KEY on the server to use Claude for request analysis.'}</div>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><div><h2>Community resources</h2><p>AI may suggest these alongside volunteers.</p></div></div>
        <div className="card-body stack-sm">
          {(resData?.resources || []).map((r) => (
            <div key={r.id} className="spread small" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              <div><b>{r.name}</b><div className="faint tiny">{r.description}</div></div>
              <div style={{ textAlign: 'right' }} className="tiny muted">{r.categories.map((c) => meta.categories[c]).join(', ')}<br />{r.contact} · {r.hours}</div>
            </div>
          ))}
        </div>
      </section>

      {confirmReset && (
        <Modal title="Reset demo data?" onClose={() => setConfirmReset(false)}
          footer={<><button className="btn ghost" onClick={() => setConfirmReset(false)}>Cancel</button><button className="btn danger" onClick={reset}>Reset everything</button></>}>
          <p className="muted">All requests, assignments, alerts and new accounts will be replaced with the original synthetic demo data.</p>
        </Modal>
      )}
    </div>
  );
}
