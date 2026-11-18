import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadUser } from './auth.js';
import { api } from './routes.js';
import { get } from './db.js';
import { startMonitor } from './monitor.js';
import { aiMode } from './ai.js';
import { DEMO_MODE, CHAIN, privyConfigured, DEV_LOGIN } from './config.js';
import { verifyPendingPayments } from './payments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(loadUser);
app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, _next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong. Please try again.' });
});

const dist = path.resolve(__dirname, '../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

if (DEMO_MODE && !get('SELECT id FROM requests LIMIT 1')) {
  const { seed } = await import('./seed.js');
  await seed();
}
startMonitor(60_000);
// Re-check payments still waiting for on-chain confirmation.
setInterval(() => verifyPendingPayments().catch((e) => console.warn('[payments]', e.message)), 30_000).unref();

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`HaveAsk on http://localhost:${port} · AI: ${aiMode()} · payments: USDC on ${CHAIN.name} · demo data: ${DEMO_MODE ? 'on' : 'off'}`);
  if (!privyConfigured() && !DEV_LOGIN) console.warn('[auth] PRIVY_APP_ID / PRIVY_APP_SECRET are not set — nobody can sign in until they are.');
});
