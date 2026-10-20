// services/ai-gateway/httpRoutes.ts
/**
 * StacFund AI Gateway — HTTP Routes
 *
 * Express route handlers for the gateway. Mounted under /api/ai/gateway/* in
 * server.ts. All routes require Firebase auth (optionalAuth → requireAuth).
 *
 * Routes:
 *   POST /api/ai/gateway/text          → non-streaming text generation
 *   POST /api/ai/gateway/stream        → streaming text generation (SSE)
 *   POST /api/ai/gateway/image         → image generation (paid-opt-in)
 *   POST /api/ai/gateway/embeddings    → embeddings
 *   GET  /api/ai/gateway/health        → provider health snapshot (admin)
 *   POST /api/ai/gateway/health/probe  → actively probe providers (admin)
 *   GET  /api/ai/gateway/usage         → current user's usage snapshot
 *   GET  /api/ai/gateway/config        → provider config (safe to expose)
 */
import type { Express, Request, Response } from 'express';
import { gateway } from './gateway';
import { GatewayError, toGatewayError } from './errors';
import { getAllHealthSnapshots, probeProviders, initHealthCheck } from './healthCheck';
import { getUsageSnapshot } from './usageTracker';
import type { GatewayRequest, ProviderId } from './types';

/** Send a GatewayError (or convert unknown error) as JSON. */
function sendError(res: Response, err: unknown) {
  const ge = err instanceof GatewayError ? err : toGatewayError(err);
  res.status(ge.statusCode || 500).json(ge.toJSON());
}

/** Extract user context from an authed request. */
function userContext(req: Request): { userId: string; plan: string } {
  const u = (req as any).user;
  const userId = u?.uid || u?.sub || 'anonymous';
  const plan = (u?.plan || u?.subscriptionPlan || 'free').toLowerCase();
  return { userId, plan };
}

/** Admin-only middleware — checks the request has the admin secret header. */
function requireAdmin(req: Request, res: Response, next: any) {
  const secret = process.env.STACFUND_ADMIN_SECRET;
  if (!secret) {
    // If no admin secret is configured, fall back to: must be a verified user.
    // In production you should ALWAYS set STACFUND_ADMIN_SECRET.
    if ((req as any).user?.uid) return next();
    return res.status(403).json({ error: 'Admin endpoints require STACFUND_ADMIN_SECRET to be configured.' });
  }
  if (req.headers['x-admin-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized: admin secret required.' });
  }
  next();
}

export function mountGatewayRoutes(app: Express) {
  // Initialise health-check subsystem with current configs.
  const configs = gateway.getConfigs();
  initHealthCheck(configs);

  // ── POST /api/ai/gateway/text ─────────────────────────────────────────
  app.post('/api/ai/gateway/text', async (req, res) => {
    try {
      const body = req.body as GatewayRequest;
      if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
        return res.status(400).json({ error: { code: 'bad_request', message: 'messages[] is required.' } });
      }
      if (body.stream === true) {
        return res.status(400).json({
          error: { code: 'bad_request', message: 'Use /api/ai/gateway/stream for streaming.' },
        });
      }
      const result = await gateway.generate(body, userContext(req));
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /api/ai/gateway/stream ───────────────────────────────────────
  app.post('/api/ai/gateway/stream', async (req, res) => {
    let aborted = false;
    req.on('close', () => {
      aborted = true;
    });
    try {
      const body = req.body as GatewayRequest;
      if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
        return res.status(400).json({ error: { code: 'bad_request', message: 'messages[] is required.' } });
      }
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const stream = gateway.generateStream(body, userContext(req));
      for await (const chunk of stream) {
        if (aborted) break;
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      if (!res.headersSent) {
        sendError(res, err);
      } else {
        const ge = err instanceof GatewayError ? err : toGatewayError(err);
        res.write(`data: ${JSON.stringify({ error: ge.toJSON() })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }
  });

  // ── POST /api/ai/gateway/image ────────────────────────────────────────
  app.post('/api/ai/gateway/image', async (req, res) => {
    try {
      const { prompt, aspectRatio, count } = req.body as {
        prompt: string;
        aspectRatio?: string;
        count?: number;
      };
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: { code: 'bad_request', message: 'prompt is required.' } });
      }
      const result = await gateway.generateImage(prompt, userContext(req), { aspectRatio, count });
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── POST /api/ai/gateway/embeddings ───────────────────────────────────
  app.post('/api/ai/gateway/embeddings', async (req, res) => {
    try {
      const { texts } = req.body as { texts: string[] };
      if (!Array.isArray(texts) || texts.length === 0) {
        return res.status(400).json({ error: { code: 'bad_request', message: 'texts[] is required.' } });
      }
      const result = await gateway.embed(texts, userContext(req));
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /api/ai/gateway/health ────────────────────────────────────────
  app.get('/api/ai/gateway/health', (req, res) => {
    res.json({ providers: getAllHealthSnapshots(), timestamp: new Date().toISOString() });
  });

  // ── POST /api/ai/gateway/health/probe ─────────────────────────────────
  app.post('/api/ai/gateway/health/probe', requireAdmin, async (req, res) => {
    try {
      const targets = gateway.getProbeTargets();
      const snapshots = await probeProviders(targets);
      res.json({ providers: snapshots, timestamp: new Date().toISOString() });
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /api/ai/gateway/usage ─────────────────────────────────────────
  app.get('/api/ai/gateway/usage', async (req, res) => {
    try {
      const ctx = userContext(req);
      const snapshot = await getUsageSnapshot(ctx.userId, ctx.plan);
      res.json(snapshot);
    } catch (err) {
      sendError(res, err);
    }
  });

  // ── GET /api/ai/gateway/config ────────────────────────────────────────
  // Safe to expose — no secrets, just provider metadata for the admin UI.
  app.get('/api/ai/gateway/config', (req, res) => {
    const configs = gateway.getConfigs();
    const safe = (Object.values(configs) as any[]).map((c) => ({
      id: c.id,
      label: c.label,
      enabled: c.enabled,
      paid: c.paid,
      capabilities: c.capabilities,
      defaultModel: c.defaultModel,
      availableModels: c.availableModels,
      priority: c.priority,
      timeoutMs: c.timeoutMs,
    }));
    res.json({ providers: safe, paidEnabled: process.env.STACFUND_ENABLE_PAID_AI === 'true' });
  });

  console.log('[Gateway] Mounted routes under /api/ai/gateway/*');
}
