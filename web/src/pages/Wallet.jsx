import { useState } from 'react';
import { useApp, useData } from '../context.js';
import { useAuthWallet } from '../wallet.jsx';
import { Empty, Icon, Loading, useToast } from '../components/ui.jsx';
import { PaymentRow, usd } from '../components/payments.jsx';

export default function Wallet() {
  const { user, meta } = useApp();
  const wallet = useAuthWallet();
  const toast = useToast();
  const { data, reload } = useData('/me/wallet');
  const [copied, setCopied] = useState(false);
  if (!data) return <Loading />;
  const care = user.role === 'coordinator' || user.role === 'admin';
  const received = data.payments.filter((p) => p.payee_id === user.id && p.status === 'confirmed');
  const pending = data.payments.filter((p) => p.payee_id === user.id && p.status !== 'confirmed');
  const copy = async () => { await navigator.clipboard?.writeText(data.address); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const fund = async () => { try { await wallet.fundWallet({ address: data.address }); reload(); } catch (e) { toast(e.message || 'Funding was cancelled.'); } };

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><h1>My wallet</h1><p>{care ? 'You send approved care payments from this wallet.' : 'Financial help and reimbursements from the care team arrive here.'}</p></div>
      </div>

      <section className="card wallet-hero">
        {data.address ? (
          <>
            <div className="spread" style={{ alignItems: 'flex-start' }}>
              <div>
                <span className="eyebrow">Balance · {data.chain.name}</span>
                <div className="wallet-bal">{data.balances ? usd(data.balances.usdc_micro / 1e6) : <span className="small muted" style={{ fontFamily: 'var(--font)' }}>Balance unavailable right now — use Explorer to check.</span>}</div>
                {care && data.balances && <div className="small muted">{(Number(data.balances.eth_wei) / 1e18).toFixed(5)} ETH for network fees</div>}
              </div>
              <div className="row">
                {wallet.available && <button className="btn primary" onClick={fund}><Icon name="plus" />Add funds</button>}
                <button className="btn" onClick={reload}><Icon name="refresh" size={14} /></button>
              </div>
            </div>
            <div className="row small" style={{ marginTop: 18 }}>
              <span className="mono addr">{data.address}</span>
              <button className="btn ghost sm" onClick={copy}><Icon name="copy" size={13} />{copied ? 'Copied' : 'Copy'}</button>
              <a className="btn ghost sm" href={`${data.chain.explorer}/address/${data.address}`} target="_blank" rel="noreferrer">Explorer <Icon name="external" size={11} /></a>
            </div>
          </>
        ) : (
          <Empty icon="👛" title="Your wallet is being created">It appears automatically after you sign in with Privy. Try refreshing in a moment.</Empty>
        )}
      </section>

      <div className="privacy-box"><Icon name="lock" size={18} /><span>This is a self-custodial wallet secured by Privy. Only you can move funds out of it. The care team can send to it, but never take from it.</span></div>

      {pending.length > 0 && (
        <section className="card"><div className="card-head"><h2>In progress</h2></div>
          <div className="card-body">{pending.map((p) => <PaymentRow key={p.id} p={p} showPayee={false} />)}</div></section>
      )}
      <section className="card">
        <div className="card-head"><h2>Received</h2>{received.length > 0 && <span className="small muted">{usd(received.reduce((n, p) => n + p.amount, 0))} total</span>}</div>
        <div className="card-body">{received.length === 0 ? <p className="small muted">Nothing received yet.</p> : received.map((p) => <PaymentRow key={p.id} p={p} showPayee={false} />)}</div>
      </section>
      {care && (
        <section className="card"><div className="card-head"><h2>Sent by you</h2></div>
          <div className="card-body">{data.sent.length === 0 ? <p className="small muted">No payments sent yet.</p> : data.sent.map((p) => <PaymentRow key={p.id} p={p} />)}</div></section>
      )}
      <p className="tiny faint">Payments are in USDC, a digital dollar, on {meta.chain.name}. 1 USDC ≈ 1 US dollar.</p>
    </div>
  );
}
