// Runtime configuration from environment variables.
export const CHAINS = {
  base: { id: 8453, name: 'Base', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org' },
  'base-sepolia': { id: 84532, name: 'Base Sepolia (testnet)', usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', rpc: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org' },
};

const chainKey = process.env.HAVEASK_CHAIN && CHAINS[process.env.HAVEASK_CHAIN] ? process.env.HAVEASK_CHAIN : 'base';
export const CHAIN = { key: chainKey, ...CHAINS[chainKey], rpc: process.env.BASE_RPC_URL || CHAINS[chainKey].rpc };
export const USDC_DECIMALS = 6;

export const PRIVY_APP_ID = process.env.PRIVY_APP_ID || '';
export const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || '';
export const privyConfigured = () => Boolean(PRIVY_APP_ID && PRIVY_APP_SECRET);

// People who become Pastor/Admin automatically the first time they sign in.
export const ADMIN_EMAILS = (process.env.HAVEASK_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

// Synthetic demo data + demo controls (fast-forward clock, reset). Off unless explicitly enabled.
export const DEMO_MODE = process.env.HAVEASK_DEMO_DATA === 'true';

// Local development only: sign in by email without Privy. Never enable in production.
export const DEV_LOGIN = process.env.HAVEASK_DEV_LOGIN === 'true' && process.env.NODE_ENV !== 'production';

// If gas sponsorship is enabled for this app in the Privy dashboard, coordinators don't need ETH for fees.
export const SPONSOR_GAS = process.env.HAVEASK_SPONSOR_GAS === 'true';
