// Payments ledger. Rules:
//  - Only a care coordinator can approve a payment; AI is never involved in money movement.
//  - The payee's wallet address always comes from the server (their Privy embedded wallet), never the browser.
//  - The coordinator signs the USDC transfer in their own wallet; the server holds no private keys.
//  - A payment only counts as paid once the server has verified the transfer on-chain.
import { all, get, run, getSettings } from './db.js';
import { now } from './clock.js';
import { CHAIN } from './config.js';
import { ACTIVE_ASSIGNMENT } from './constants.js';
import { verifyUsdcTransfer, isTxHash, toMicro, fromMicro } from './chain.js';
import { logActivity, notify, notifyCareTeam, httpError } from './services.js';

export const KIND_LABEL = { financial_help: 'Financial help', reimbursement: 'Reimbursement', service: 'Payment for service' };
export const fmtUsdc = (micro) => `${fromMicro(micro).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;

function parseAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw httpError(400, 'Please enter an amount greater than zero.');
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) throw httpError(400, 'Amounts can have at most two decimal places.');
  const max = getSettings().payment_max_usdc;
  if (n > max) throw httpError(400, `Payments are limited to ${max} USDC each. Change the limit in Settings if needed.`);
  return toMicro(n);
}

/** Who may be paid for a request: the member who asked, or a volunteer who has (or had) an assignment on it. */
function checkPayee(request, payeeId, kind) {
  if (kind === 'financial_help') {
    if (payeeId !== request.member_id) throw httpError(400, 'Financial help can only be paid to the member who asked.');
  } else {
    const a = get(`SELECT id FROM assignments WHERE request_id = ? AND volunteer_id = ? AND status IN (${[...ACTIVE_ASSIGNMENT, 'completed'].map(() => '?').join(',')})`,
      request.id, payeeId, ...ACTIVE_ASSIGNMENT, 'completed');
    if (!a) throw httpError(400, 'That volunteer is not assigned to this request.');
    return a.id;
  }
  return null;
}

export function createPayment({ requestId, payeeId, kind, amount, note, coordinatorId }) {
  if (!KIND_LABEL[kind]) throw httpError(400, 'Choose what this payment is for.');
  const request = get('SELECT * FROM requests WHERE id = ?', requestId);
  if (!request) throw httpError(404, 'Request not found.');
  const assignmentId = checkPayee(request, payeeId, kind);
  const payee = get('SELECT id, name, wallet_address FROM users WHERE id = ?', payeeId);
  if (!payee?.wallet_address) throw httpError(400, `${payee?.name || 'This person'} doesn’t have a wallet yet. They get one automatically the first time they sign in.`);
  const micro = parseAmount(amount);
  const t = now();
  const r = run(`INSERT INTO payments(request_id, assignment_id, payee_id, kind, amount_micro, note, status, requested_by, approved_by,
      payee_address, chain_id, token_address, created_at, updated_at) VALUES (?,?,?,?,?,?, 'approved', ?, ?, ?, ?, ?, ?, ?)`,
    request.id, assignmentId, payee.id, kind, micro, String(note || '').slice(0, 300) || null, coordinatorId, coordinatorId,
    payee.wallet_address, CHAIN.id, CHAIN.usdc, t, t);
  logActivity(request.id, coordinatorId, 'payment_approved', `${KIND_LABEL[kind]} of ${fmtUsdc(micro)} to ${payee.name} approved — awaiting signature`, { at: t });
  return Number(r.lastInsertRowid);
}

export function requestReimbursement({ assignmentId, volunteerId, amount, note }) {
  const a = get('SELECT * FROM assignments WHERE id = ? AND volunteer_id = ?', assignmentId, volunteerId);
  if (!a) throw httpError(404, 'Assignment not found.');
  if (!['accepted', 'contacted', 'helping', 'needs_support', 'completed'].includes(a.status)) throw httpError(400, 'You can request reimbursement once you’ve accepted the assignment.');
  if (!String(note || '').trim()) throw httpError(400, 'Please say what the money was spent on.');
  const micro = parseAmount(amount);
  const vol = get('SELECT name, wallet_address FROM users WHERE id = ?', volunteerId);
  const t = now();
  const r = run(`INSERT INTO payments(request_id, assignment_id, payee_id, kind, amount_micro, note, status, requested_by,
      payee_address, chain_id, token_address, created_at, updated_at) VALUES (?,?,?, 'reimbursement', ?, ?, 'requested', ?, ?, ?, ?, ?, ?)`,
    a.request_id, a.id, volunteerId, micro, String(note).trim().slice(0, 300), volunteerId, vol.wallet_address, CHAIN.id, CHAIN.usdc, t, t);
  logActivity(a.request_id, volunteerId, 'reimbursement_requested', `${vol.name} requested reimbursement of ${fmtUsdc(micro)}: “${String(note).trim()}”`, { at: t });
  notifyCareTeam({ type: 'reimbursement', title: `${vol.name} requested ${fmtUsdc(micro)} reimbursement`, body: String(note).trim(), link: `/care/payments`, at: t });
  return Number(r.lastInsertRowid);
}

export function reviewReimbursement(paymentId, coordinatorId, approve, reason) {
  const p = get('SELECT * FROM payments WHERE id = ?', paymentId);
  if (!p) throw httpError(404, 'Payment not found.');
  if (p.status !== 'requested') throw httpError(400, 'This reimbursement has already been reviewed.');
  const payee = get('SELECT name, wallet_address FROM users WHERE id = ?', p.payee_id);
  const t = now();
  if (approve) {
    if (!payee.wallet_address) throw httpError(400, `${payee.name} doesn’t have a wallet yet.`);
    parseAmount(fromMicro(p.amount_micro)); // re-check against the current limit
    run("UPDATE payments SET status = 'approved', approved_by = ?, payee_address = ?, updated_at = ? WHERE id = ?", coordinatorId, payee.wallet_address, t, p.id);
    if (p.request_id) logActivity(p.request_id, coordinatorId, 'payment_approved', `Reimbursement of ${fmtUsdc(p.amount_micro)} to ${payee.name} approved — awaiting signature`, { at: t });
  } else {
    run("UPDATE payments SET status = 'declined', approved_by = ?, error = ?, updated_at = ? WHERE id = ?", coordinatorId, reason || null, t, p.id);
    notify(p.payee_id, { type: 'reimbursement_declined', title: 'Your reimbursement request was not approved', body: reason || 'Please speak with your care coordinator.', link: '/wallet', at: t });
    if (p.request_id) logActivity(p.request_id, coordinatorId, 'payment_declined', `Reimbursement of ${fmtUsdc(p.amount_micro)} to ${payee.name} declined${reason ? ` — “${reason}”` : ''}`, { at: t });
  }
}

export function cancelPayment(paymentId, coordinatorId) {
  const p = get('SELECT * FROM payments WHERE id = ?', paymentId);
  if (!p) throw httpError(404, 'Payment not found.');
  if (!['approved', 'failed'].includes(p.status)) throw httpError(400, 'Only unsent payments can be cancelled.');
  run("UPDATE payments SET status = 'cancelled', updated_at = ? WHERE id = ?", now(), p.id);
  if (p.request_id) logActivity(p.request_id, coordinatorId, 'payment_cancelled', `Payment of ${fmtUsdc(p.amount_micro)} cancelled`);
}

/** The coordinator's wallet broadcast the transfer; record the hash and verify it. */
export async function submitPayment(paymentId, coordinator, txHash) {
  const p = get('SELECT * FROM payments WHERE id = ?', paymentId);
  if (!p) throw httpError(404, 'Payment not found.');
  if (!['approved', 'failed'].includes(p.status)) throw httpError(400, 'This payment is not waiting to be sent.');
  if (!isTxHash(txHash)) throw httpError(400, 'Invalid transaction hash.');
  if (get('SELECT id FROM payments WHERE tx_hash = ? AND id != ?', txHash, p.id)) throw httpError(400, 'That transaction is already linked to another payment.');
  const payer = get('SELECT wallet_address FROM users WHERE id = ?', coordinator.id)?.wallet_address;
  if (!payer) throw httpError(400, 'Your account has no wallet linked. Sign out and in again.');
  run("UPDATE payments SET status = 'submitted', tx_hash = ?, payer_address = ?, error = NULL, updated_at = ? WHERE id = ?", txHash, payer, now(), p.id);
  return verifyPayment(p.id);
}

/** Re-check a submitted payment on-chain. Safe to call repeatedly. */
export async function verifyPayment(paymentId) {
  const p = get('SELECT * FROM payments WHERE id = ?', paymentId);
  if (!p || p.status !== 'submitted') return p;
  let result;
  try {
    result = await verifyUsdcTransfer({ txHash: p.tx_hash, from: p.payer_address, to: p.payee_address, amountMicro: p.amount_micro });
  } catch (e) {
    console.warn('[payments] verification RPC error:', e.message);
    return get('SELECT * FROM payments WHERE id = ?', p.id);
  }
  const t = now();
  if (result.state === 'confirmed') {
    run("UPDATE payments SET status = 'confirmed', confirmed_at = ?, updated_at = ? WHERE id = ? AND status = 'submitted'", t, t, p.id);
    const payee = get('SELECT name, role FROM users WHERE id = ?', p.payee_id);
    if (p.request_id) {
      logActivity(p.request_id, p.approved_by, 'payment_confirmed', `${KIND_LABEL[p.kind]} of ${fmtUsdc(p.amount_micro)} to ${payee.name} confirmed on ${CHAIN.name}`, { at: t });
      const req = get('SELECT member_id FROM requests WHERE id = ?', p.request_id);
      if (req?.member_id === p.payee_id) logActivity(p.request_id, p.approved_by, 'member_status', `The care team sent you ${fmtUsdc(p.amount_micro)}`, { memberVisible: true, at: t });
    }
    notify(p.payee_id, {
      type: 'payment', title: `You received ${fmtUsdc(p.amount_micro)}`,
      body: p.kind === 'reimbursement' ? 'Your reimbursement has been paid to your HaveAsk wallet. Thank you for serving.' : `${KIND_LABEL[p.kind]} from the care team is now in your HaveAsk wallet.`,
      link: '/wallet', at: t,
    });
  } else if (result.state === 'failed') {
    run("UPDATE payments SET status = 'failed', error = ?, updated_at = ? WHERE id = ?", result.reason, t, p.id);
  }
  return get('SELECT * FROM payments WHERE id = ?', p.id);
}

/** Keep checking payments that are still pending (e.g. after a server restart). */
export async function verifyPendingPayments() {
  for (const p of all("SELECT id FROM payments WHERE status = 'submitted'")) await verifyPayment(p.id);
}

export function paymentView(p) {
  if (!p) return null;
  const payee = get('SELECT name FROM users WHERE id = ?', p.payee_id);
  return {
    id: p.id, request_id: p.request_id, assignment_id: p.assignment_id, payee_id: p.payee_id, payee_name: payee?.name,
    kind: p.kind, kind_label: KIND_LABEL[p.kind], amount: fromMicro(p.amount_micro), amount_micro: p.amount_micro, note: p.note,
    status: p.status, payee_address: p.payee_address, payer_address: p.payer_address, chain_id: p.chain_id, token_address: p.token_address,
    tx_hash: p.tx_hash, tx_url: p.tx_hash ? `${CHAIN.explorer}/tx/${p.tx_hash}` : null, error: p.error,
    created_at: p.created_at, confirmed_at: p.confirmed_at,
  };
}
