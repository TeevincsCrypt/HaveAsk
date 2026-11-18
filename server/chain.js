// Minimal Base JSON-RPC helpers: balances and verifying that a USDC transfer really happened.
import { CHAIN, USDC_DECIMALS } from './config.js';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function rpc(method, params) {
  const res = await fetch(CHAIN.rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || 'RPC error');
  return body.result;
}

const pad = (addr) => '0x' + addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
export const isAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
export const isTxHash = (h) => typeof h === 'string' && /^0x[0-9a-fA-F]{64}$/.test(h);

export async function getBalances(address) {
  if (!isAddress(address)) return null;
  const data = '0x70a08231' + pad(address).slice(2); // balanceOf(address)
  const [usdc, eth] = await Promise.all([
    rpc('eth_call', [{ to: CHAIN.usdc, data }, 'latest']),
    rpc('eth_getBalance', [address, 'latest']),
  ]);
  return { usdc_micro: Number(BigInt(usdc)), eth_wei: BigInt(eth).toString() };
}

/**
 * Check a submitted transaction on-chain.
 * Returns { state: 'pending' } until mined, then 'confirmed' only if it contains a USDC Transfer
 * of exactly `amountMicro` from `from` to `to`; otherwise 'failed' with a reason.
 */
export async function verifyUsdcTransfer({ txHash, from, to, amountMicro }) {
  const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!receipt) return { state: 'pending' };
  if (receipt.status !== '0x1') return { state: 'failed', reason: 'The transaction was reverted on-chain.' };
  const match = (receipt.logs || []).find((log) =>
    log.address?.toLowerCase() === CHAIN.usdc.toLowerCase()
    && log.topics?.[0] === TRANSFER_TOPIC
    && log.topics?.[1]?.toLowerCase() === pad(from)
    && log.topics?.[2]?.toLowerCase() === pad(to)
    && BigInt(log.data) === BigInt(amountMicro));
  if (!match) return { state: 'failed', reason: 'The transaction does not contain the expected USDC transfer.' };
  return { state: 'confirmed', blockNumber: Number(BigInt(receipt.blockNumber)) };
}

export const toMicro = (usdc) => Math.round(Number(usdc) * 10 ** USDC_DECIMALS);
export const fromMicro = (micro) => (Number(micro) / 10 ** USDC_DECIMALS);
