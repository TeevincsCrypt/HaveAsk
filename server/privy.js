// Privy identity: verify the browser's access token and read the user's email + embedded wallet.
import { PrivyClient } from '@privy-io/node';
import { PRIVY_APP_ID, PRIVY_APP_SECRET, privyConfigured } from './config.js';

let client = null;
function privy() {
  if (!privyConfigured()) return null;
  if (!client) client = new PrivyClient({ appId: PRIVY_APP_ID, appSecret: PRIVY_APP_SECRET });
  return client;
}

/** Returns the Privy user id for a valid access token, or throws. */
export async function verifyPrivyToken(accessToken) {
  const c = privy();
  if (!c) throw Object.assign(new Error('Sign-in is not configured on this server.'), { status: 503 });
  try {
    const claims = await c.utils().auth().verifyAccessToken(String(accessToken || ''));
    return claims.user_id;
  } catch {
    throw Object.assign(new Error('Your sign-in session is invalid or expired. Please sign in again.'), { status: 401 });
  }
}

/** Reads the Privy profile we care about: email, display name, and the embedded Ethereum wallet address. */
export async function getPrivyProfile(privyUserId) {
  const c = privy();
  if (!c) throw Object.assign(new Error('Sign-in is not configured on this server.'), { status: 503 });
  const user = await c.users()._get(privyUserId);
  const accounts = user.linked_accounts || [];
  const email = accounts.find((a) => a.type === 'email')?.address
    || accounts.find((a) => a.type === 'google_oauth')?.email
    || null;
  const name = accounts.find((a) => a.type === 'google_oauth')?.name || null;
  const wallet = accounts.find((a) => a.type === 'wallet' && a.chain_type === 'ethereum' && a.wallet_client_type === 'privy');
  return { email: email ? email.toLowerCase() : null, name, walletAddress: wallet?.address || null };
}
