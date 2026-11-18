// Payment rules + on-chain verification (Base RPC is mocked).
process.env.HAVEASK_DB = ':memory:';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { seed } = await import('../seed.js');
const { get, run } = await import('../db.js');
const { CHAIN } = await import('../config.js');
const { createPayment, requestReimbursement, reviewReimbursement, submitPayment } = await import('../payments.js');

await seed({ quiet: true });
const coord = get("SELECT * FROM users WHERE email = 'care@haveask.demo'");
const COORD_WALLET = '0x1111111111111111111111111111111111111111';
const MEMBER_WALLET = '0x2222222222222222222222222222222222222222';
const VOL_WALLET = '0x3333333333333333333333333333333333333333';
run('UPDATE users SET wallet_address = ? WHERE id = ?', COORD_WALLET, coord.id);
const sarah = get("SELECT * FROM users WHERE email = 'member@haveask.demo'");
run('UPDATE users SET wallet_address = ? WHERE id = ?', MEMBER_WALLET, sarah.id);
const ruth = get("SELECT * FROM users WHERE email = 'ruth@haveask.demo'");
run('UPDATE users SET wallet_address = ? WHERE id = ?', VOL_WALLET, ruth.id);
const sarahReq = get("SELECT id FROM requests WHERE member_id = ? AND status = 'pending'", sarah.id).id;
const ruthAssignment = get("SELECT * FROM assignments WHERE volunteer_id = ? AND status = 'helping'", ruth.id);

const pad = (a) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
function mockReceipt({ from = COORD_WALLET, to, micro, status = '0x1', token = CHAIN.usdc }) {
  globalThis.fetch = async () => ({
    json: async () => ({ result: { status, blockNumber: '0x10', logs: [{
      address: token,
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', pad(from), pad(to)],
      data: '0x' + BigInt(micro).toString(16),
    }] } }),
  });
}
const hash = (n) => '0x' + String(n).repeat(64).slice(0, 64);

test('financial help can only go to the member who asked', () => {
  assert.throws(() => createPayment({ requestId: sarahReq, payeeId: ruth.id, kind: 'financial_help', amount: 10, coordinatorId: coord.id }), /member who asked/);
});

test('payments are capped and must have a wallet', () => {
  assert.throws(() => createPayment({ requestId: sarahReq, payeeId: sarah.id, kind: 'financial_help', amount: 5000, coordinatorId: coord.id }), /limited to/);
  const linda = get("SELECT * FROM users WHERE email = 'linda@haveask.demo'");
  const lindaReq = get("SELECT id FROM requests WHERE member_id = ? AND status = 'pending'", linda.id).id;
  assert.throws(() => createPayment({ requestId: lindaReq, payeeId: linda.id, kind: 'financial_help', amount: 10, coordinatorId: coord.id }), /doesn’t have a wallet/);
});

test('confirmed only when the exact USDC transfer is on-chain', async () => {
  const pid = createPayment({ requestId: sarahReq, payeeId: sarah.id, kind: 'financial_help', amount: 40, note: 'Groceries', coordinatorId: coord.id });
  mockReceipt({ to: MEMBER_WALLET, micro: 40_000_000 });
  const p = await submitPayment(pid, coord, hash(1));
  assert.equal(p.status, 'confirmed');
  assert.ok(get("SELECT id FROM notifications WHERE user_id = ? AND type = 'payment'", sarah.id), 'member is notified');
  assert.ok(get("SELECT id FROM activity WHERE request_id = ? AND type = 'member_status' AND message LIKE '%sent you%'", sarahReq));
});

test('a transfer to the wrong address or for the wrong amount fails verification', async () => {
  const pid = createPayment({ requestId: sarahReq, payeeId: sarah.id, kind: 'financial_help', amount: 25, coordinatorId: coord.id });
  mockReceipt({ to: '0x9999999999999999999999999999999999999999', micro: 25_000_000 });
  assert.equal((await submitPayment(pid, coord, hash(2))).status, 'failed');
  mockReceipt({ to: MEMBER_WALLET, micro: 24_000_000 });
  assert.equal((await submitPayment(pid, coord, hash(3))).status, 'failed');
  mockReceipt({ to: MEMBER_WALLET, micro: 25_000_000, token: '0x4444444444444444444444444444444444444444' });
  assert.equal((await submitPayment(pid, coord, hash(4))).status, 'failed');
});

test('a transaction hash cannot be reused for a second payment', async () => {
  const pid = createPayment({ requestId: sarahReq, payeeId: sarah.id, kind: 'financial_help', amount: 5, coordinatorId: coord.id });
  await assert.rejects(() => submitPayment(pid, coord, hash(1)), /already linked/);
});

test('pending until mined', async () => {
  const pid = createPayment({ requestId: sarahReq, payeeId: sarah.id, kind: 'financial_help', amount: 7, coordinatorId: coord.id });
  globalThis.fetch = async () => ({ json: async () => ({ result: null }) });
  assert.equal((await submitPayment(pid, coord, hash(5))).status, 'submitted');
});

test('volunteer reimbursement needs coordinator approval before it can be paid', async () => {
  const pid = requestReimbursement({ assignmentId: ruthAssignment.id, volunteerId: ruth.id, amount: 18.4, note: 'Pharmacy parking + fuel' });
  await assert.rejects(() => submitPayment(pid, coord, hash(6)), /not waiting to be sent/);
  reviewReimbursement(pid, coord.id, true);
  mockReceipt({ to: VOL_WALLET, micro: 18_400_000 });
  assert.equal((await submitPayment(pid, coord, hash(6))).status, 'confirmed');
});
