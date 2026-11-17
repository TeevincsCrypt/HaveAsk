import { useState } from 'react';
import { useApp, useData } from '../../context.js';
import { AlertItem } from '../../components/care.jsx';
import { Empty, Icon, Loading, useToast } from '../../components/ui.jsx';
import { post } from '../../api.js';

export default function CareAlerts() {
  const { meta, bump } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState('active');
  const { data, reload } = useData(`/care/alerts?status=${tab}`);
  const run = async () => {
    const { stats } = await post('/care/monitor/run');
    toast(`Scanned ${stats.scanned} open requests · ${stats.created} new alert(s) · ${stats.cleared} cleared.`);
    bump(); reload();
  };
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Unresolved request alerts</h1>
          <p>The care monitor checks every open request each minute for signs it may be forgotten. Alerts clear automatically once the issue is addressed.</p>
        </div>
        <button className="btn" onClick={run}><Icon name="refresh" />Run check now</button>
      </div>

      <div className="tabs">
        {[['active', 'Active', (data?.counts?.open || 0) + (data?.counts?.acknowledged || 0)], ['snoozed', 'Snoozed', data?.counts?.snoozed || 0], ['resolved', 'Resolved', data?.counts?.resolved || 0]].map(([k, l, c]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}<span className="c">{c}</span></button>
        ))}
      </div>

      <section className={`card ${tab === 'active' ? 'alert-panel' : ''}`}>
        {!data ? <Loading /> : data.alerts.length === 0
          ? <Empty icon={tab === 'active' ? '✅' : '🗂️'} title={tab === 'active' ? 'No requests at risk' : `No ${tab} alerts`}>{tab === 'active' ? 'Every open request has an owner and recent activity.' : null}</Empty>
          : data.alerts.map((a) => <AlertItem key={a.id} a={a} onChange={reload} />)}
      </section>

      <section className="card">
        <div className="card-head"><h2>What the monitor looks for</h2></div>
        <div className="card-body">
          <ul className="needs small" style={{ display: 'grid', gap: 6 }}>
            <li><b>{meta.rules.high_unassigned}</b> — high-urgency requests waiting without a volunteer.</li>
            <li><b>{meta.rules.offer_unanswered}</b> — a volunteer was asked but hasn’t accepted or declined.</li>
            <li><b>{meta.rules.volunteer_silent}</b> — accepted, but no progress update for several days.</li>
            <li><b>{meta.rules.no_member_contact}</b> — nobody has recorded contact with the person who asked.</li>
            <li><b>{meta.rules.needs_support}</b> — the volunteer said this is more than they can manage.</li>
            <li><b>{meta.rules.unassigned_aging}</b> / <b>{meta.rules.stale}</b> — requests sitting idle too long.</li>
            <li><b>{meta.rules.safeguarding}</b> — AI noticed language suggesting risk; a pastor should reach out personally.</li>
          </ul>
          <p className="tiny faint" style={{ marginTop: 10 }}>Thresholds are adjustable in Settings. The monitor only alerts people and sends gentle reminders — it never reassigns volunteers or contacts members.</p>
        </div>
      </section>
    </div>
  );
}
