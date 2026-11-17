import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadUser } from './auth.js';
import { api } from './routes.js';
import { get } from './db.js';
import { startMonitor } from './monitor.js';
import { aiMode } from './ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
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

if (!get('SELECT id FROM users LIMIT 1')) {
  const { seed } = await import('./seed.js');
  await seed();
}
startMonitor(60_000);

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`HaveAsk API on http://localhost:${port} (AI mode: ${aiMode()})`);
});
