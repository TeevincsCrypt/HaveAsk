import { useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../../api.js';
import { useApp, useData } from '../../context.js';
import { Empty, Icon, Loading, Modal, useToast } from '../../components/ui.jsx';
import { PaymentRow, usePay, usd } from '../../components/payments.jsx';

export default function CarePayments() {
  const { bump, meta } = useApp();
  const toast = useToast();
  const { data, reload } = useData('/care/payments');
  const { data: w } = useData('/me/wallet');
  const { pay, busyId } = usePay();
  const [declining, setDeclining] = useState(null);
  const [reason, setReason] = useState('');
  if (!data) return <Loading />;
  const list = data.payments;
  const requested = list.filter((p) => p.status === 'requested');
  const toSend = list.filter((p) => p.status === 'approved' || p.status === 'failed');
  const history = list.filter((p) => !['requested', 'approved', 'failed'].includes(p.status));
  const act = async (path, msg) => { try { await post(path); toast(msg); reload(); bump(); } catch (e) { toast(e.message); } };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1>Payments</h1><p>Financial help for members and reimbursements or payment for volunteers, in USDC on {meta.chain.name}. Every payment is approved and signed by a person.</p></div>
        <Link to="/wallet" className="card" style={{ padding: '12px 16px', color: 'inherit' }}>
          <div className="tiny faint">Your sending wallet</div>
          <div className="row" style={{ gap: 8 }}><b className="serif" style={{ fontSize: 24, fontWeight: 400 }}>{w?.balances ? usd(w.balances.usdc_micro / 1e6) : '—'}</b></div>
        </Link>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <div className="stat"><div className="n">{requested.length}</div><div className="l">Reimbursements to review</div></div>
        <div className="stat"><div className="n">{toSend.length}</div><div className="l">Approved, not yet sent</div></div>
        <div className="stat"><div className="n" style={{ fontSize: 36 }}>{usd(data.totals.paid)}</div><div className="l">Paid · {data.totals.count} payments</div></div>
      </div>

      <section className="card">
        <div className="card-head"><div><h2>Reimbursement requests</h2><p>Volunteers asking to be paid back for costs on an assignment.</p></div></div>
        <div className="card-body">
          {requested.length === 0 ? <p className="small muted">No requests waiting.</p> : requested.map((p) => (
            <PaymentRow key={p.id} p={p} actions={<>
              <button className="btn ghost sm" onClick={() => setDeclining(p)}>Decline</button>
              <button className="btn sm" onClick={() => act(`/care/payments/${p.id}/approve`, 'Approved. Now sign it to send.')}>Approve</button>
            </>} />
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head"><div><h2>Ready to send</h2><p>Approved payments waiting for your signature.</p></div></div>
        <div className="card-body">
          {toSend.length === 0 ? <p className="small muted">Nothing waiting to be sent.</p> : toSend.map((p) => (
            <PaymentRow key={p.id} p={p} actions={<>
              <button className="btn ghost sm" onClick={() => act(`/care/payments/${p.id}/cancel`, 'Payment cancelled.')}>Cancel</button>
              <button className="btn primary sm" disabled={busyId === p.id} onClick={() => pay(p)}><Icon name="wallet" size={13} />{busyId === p.id ? 'Sending…' : p.status === 'failed' ? 'Retry' : 'Sign & send'}</button>
            </>} />
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>History</h2></div>
        <div className="card-body">{history.length === 0 ? <Empty icon="🧾" title="No payments yet">Send one from a request’s page.</Empty> : history.map((p) => (
          <PaymentRow key={p.id} p={p} actions={p.status === 'submitted' && <button className="btn ghost sm" onClick={() => act(`/care/payments/${p.id}/verify`, 'Re-checked on-chain.')}>Re-check</button>} />
        ))}</div>
      </section>

      {declining && (
        <Modal title="Decline reimbursement" onClose={() => setDeclining(null)}
          footer={<><button className="btn ghost" onClick={() => setDeclining(null)}>Cancel</button>
            <button className="btn danger" onClick={async () => { try { await post(`/care/payments/${declining.id}/decline`, { reason }); toast('Declined. The volunteer has been told.'); setDeclining(null); setReason(''); reload(); } catch (e) { toast(e.message); } }}>Decline</button></>}>
          <div className="stack-sm"><p className="muted small">{declining.payee_name} asked for {usd(declining.amount)}: “{declining.note}”. A short, kind reason helps.</p>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Please share the receipt with me first" autoFocus /></div>
        </Modal>
      )}
    </div>
  );
}
