import { useState } from 'react';
import { post } from '../api.js';
import { useApp } from '../context.js';
import { useAuthWallet } from '../wallet.jsx';
import { relTime } from '../format.js';
import { Icon, Modal, useToast } from './ui.jsx';

export const usd = (n) => `${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;
export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');

const STATUS = {
  requested: ['warn', 'Awaiting approval'], approved: ['info', 'Approved · not sent'], submitted: ['info', 'Confirming on-chain…'],
  confirmed: ['ok', 'Paid'], failed: ['crit', 'Failed'], declined: ['neutral', 'Declined'], cancelled: ['neutral', 'Cancelled'],
};
export function PaymentStatus({ status }) {
  const [c, l] = STATUS[status] || ['neutral', status];
  return <span className={`badge ${c}`}>{status === 'confirmed' && <Icon name="check" size={11} />}{l}</span>;
}

/** Coordinator flow: sign the approved USDC transfer in their Privy wallet, then let the server verify it. */
export function usePay() {
  const { user, meta, bump } = useApp();
  const wallet = useAuthWallet();
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);
  const pay = async (p) => {
    if (!wallet.available) return toast('Payments need Privy sign-in to be configured.');
    if (!user.wallet_address) return toast('Your wallet isn’t ready yet. Sign out and back in, then try again.');
    setBusyId(p.id);
    try {
      const hash = await wallet.sendUsdc({
        token: p.token_address, to: p.payee_address, amountMicro: p.amount_micro, chainId: p.chain_id,
        from: user.wallet_address, sponsor: meta.sponsorGas, description: `${p.kind_label}: ${usd(p.amount)} to ${p.payee_name}`,
      });
      const d = await post(`/care/payments/${p.id}/submitted`, { tx_hash: hash });
      toast(d.payment.status === 'confirmed' ? `Paid ${usd(p.amount)} to ${p.payee_name}. Verified on-chain.` : 'Sent. Waiting for on-chain confirmation…');
      bump();
      if (d.payment.status === 'submitted') pollVerify(p.id, bump);
    } catch (e) {
      toast(/rejected|denied|cancel/i.test(e?.message || '') ? 'Payment cancelled — nothing was sent.' : (e.message || 'The payment could not be sent.'));
    } finally { setBusyId(null); }
  };
  return { pay, busyId };
}

function pollVerify(id, bump, tries = 12) {
  setTimeout(async () => {
    const d = await post(`/care/payments/${id}/verify`).catch(() => null);
    if (d?.payment?.status === 'submitted' && tries > 1) return pollVerify(id, bump, tries - 1);
    bump();
  }, 5000);
}

export function PaymentRow({ p, showPayee = true, actions }) {
  const { now } = useApp();
  return (
    <div className="pay-row">
      <div className="pay-amt">{usd(p.amount)}</div>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <b className="small">{p.kind_label}{showPayee && p.payee_name ? ` · ${p.payee_name}` : ''}</b>
          <PaymentStatus status={p.status} />
        </div>
        {p.note && <div className="small muted">{p.note}</div>}
        <div className="tiny faint">
          {relTime(p.confirmed_at || p.created_at, now)}
          {p.request_id && <> · request #{p.request_id}</>}
          {p.tx_url && <> · <a href={p.tx_url} target="_blank" rel="noreferrer">View transaction <Icon name="external" size={10} /></a></>}
        </div>
        {p.error && p.status === 'failed' && <div className="tiny" style={{ color: 'var(--crit)' }}>{p.error}</div>}
      </div>
      {actions && <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>{actions}</div>}
    </div>
  );
}

/** Create + sign a payment on a request. Payees are restricted server-side too. */
export function SendPaymentModal({ request, payees, defaultPayee, onClose }) {
  const { meta } = useApp();
  const toast = useToast();
  const { pay } = usePay();
  const [f, setF] = useState({ payee_id: defaultPayee?.id || payees[0]?.id || '', kind: defaultPayee?.kind || payees[0]?.kind || 'financial_help', amount: '', note: '' });
  const [busy, setBusy] = useState(false);
  const payee = payees.find((p) => p.id === Number(f.payee_id));
  const kinds = payee?.kind === 'financial_help' ? [['financial_help', 'Financial help']] : [['reimbursement', 'Reimbursement'], ['service', 'Payment for service']];

  const submit = async () => {
    setBusy(true);
    try {
      const d = await post(`/care/requests/${request.id}/payments`, { ...f, payee_id: Number(f.payee_id) });
      onClose();
      await pay(d.payment);
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Send a payment" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !payee || !(Number(f.amount) > 0)} onClick={submit}><Icon name="wallet" />Approve & sign {f.amount ? usd(f.amount) : ''}</button></>}>
      <div className="stack">
        <div className="field"><label>Pay to</label>
          <select className="select" value={f.payee_id} onChange={(e) => { const p = payees.find((x) => x.id === Number(e.target.value)); setF({ ...f, payee_id: e.target.value, kind: p.kind }); }}>
            {payees.map((p) => <option key={p.id} value={p.id} disabled={!p.wallet}>{p.label}{p.wallet ? '' : ' — no wallet yet'}</option>)}
          </select></div>
        <div className="grid-2">
          <div className="field"><label>For</label>
            <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label>Amount (USDC)</label>
            <input className="input" type="number" min="0.01" step="0.01" max={meta.paymentMaxUsdc} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0.00" /></div>
        </div>
        <div className="field"><label>Note <span className="faint">(shown to the recipient)</span></label>
          <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Help with this month’s electricity bill" /></div>
        <div className="privacy-box" style={{ fontSize: 13 }}>
          <Icon name="shield" size={16} />
          <span>You’ll sign this from your own wallet{meta.sponsorGas ? '' : ' (it needs USDC plus a little ETH on Base for fees)'}. Real funds on {meta.chain.name}; transfers can’t be reversed. The transfer is public on the blockchain, showing wallet addresses but no names.</span>
        </div>
      </div>
    </Modal>
  );
}
