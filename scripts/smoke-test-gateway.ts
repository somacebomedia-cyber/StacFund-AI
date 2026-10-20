// scripts/smoke-test-gateway.ts
/**
 * Boot-time smoke test for the AI Gateway.
 *
 * Boots a minimal Express server with the gateway mounted (no Vite, no
 * Firebase, no scraper) and hits the /api/ai/gateway/health + /config
 * endpoints to verify the gateway initialises cleanly.
 *
 * Run with: npx tsx scripts/smoke-test-gateway.ts
 */
import express from 'express';
import { gateway, initUsageTracker, initHealthCheck } from '../services/ai-gateway';
import { mountGatewayRoutes } from '../services/ai-gateway/httpRoutes';

const app = express();
app.use(express.json());

// Optional auth — passes through (no Firebase in this smoke test).
app.use('/api/ai/gateway', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  (req as any).user = { uid: 'smoke-test-user', plan: 'free' };
  next();
});

mountGatewayRoutes(app);

const PORT = 3939;
const server = app.listen(PORT, async () => {
  console.log(`\n[smoke-test] Server listening on http://localhost:${PORT}`);

  // Initialise gateway
  try {
    initUsageTracker(null);
    const configs = gateway.getConfigs();
    initHealthCheck(configs);
    console.log('[smoke-test] Gateway initialised.');
    console.log('[smoke-test] Provider configs:');
    for (const c of Object.values(configs)) {
      console.log(`  ${c.id.padEnd(12)} enabled=${c.enabled}  model=${c.defaultModel}  paid=${c.paid}`);
    }
  } catch (e) {
    console.error('[smoke-test] Gateway init failed:', e);
    server.close();
    process.exit(1);
  }

  // Hit /api/ai/gateway/health
  try {
    const r1 = await fetch(`http://localhost:${PORT}/api/ai/gateway/health`);
    const j1 = await r1.json();
    console.log('\n[smoke-test] GET /health →', r1.status);
    console.log(JSON.stringify(j1, null, 2));
  } catch (e) {
    console.error('[smoke-test] /health failed:', e);
  }

  // Hit /api/ai/gateway/config
  try {
    const r2 = await fetch(`http://localhost:${PORT}/api/ai/gateway/config`);
    const j2 = await r2.json();
    console.log('\n[smoke-test] GET /config →', r2.status);
    console.log(JSON.stringify(j2, null, 2));
  } catch (e) {
    console.error('[smoke-test] /config failed:', e);
  }

  // Hit /api/ai/gateway/usage (no real user, but should return shape)
  try {
    const r3 = await fetch(`http://localhost:${PORT}/api/ai/gateway/usage`);
    const j3 = await r3.json();
    console.log('\n[smoke-test] GET /usage →', r3.status);
    console.log(JSON.stringify(j3, null, 2));
  } catch (e) {
    console.error('[smoke-test] /usage failed:', e);
  }

  // If GEMINI_API_KEY is set, try a tiny generate
  if (process.env.GEMINI_API_KEY) {
    try {
      const r4 = await fetch(`http://localhost:${PORT}/api/ai/gateway/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'chat',
          messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
          maxTokens: 5,
          caller: 'smoke-test',
        }),
      });
      const j4 = await r4.json();
      console.log('\n[smoke-test] POST /text →', r4.status);
      console.log(JSON.stringify(j4, null, 2));
    } catch (e) {
      console.error('[smoke-test] /text failed:', e);
    }
  } else {
    console.log('\n[smoke-test] GEMINI_API_KEY not set — skipping live generate test.');
  }

  console.log('\n[smoke-test] DONE.');
  server.close();
  process.exit(0);
});
