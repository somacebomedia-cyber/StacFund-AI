// services/ai-gateway/gateway.ts
/**
 * StacFund AI Gateway — Main Facade
 *
 * This is the single entry point used by the HTTP endpoints. It:
 *
 *   1. Classifies the task (if not provided).
 *   2. Selects an ordered provider chain via the router.
 *   3. Checks per-user usage limits (rejects if exceeded).
 *   4. Executes the chain, falling back on retryable errors.
 *   5. Records usage (in-memory + Firestore) on success.
 *   6. Updates provider health (circuit breaker) on success/failure.
 *   7. Returns a unified GatewayResponse (or GatewayStreamChunk stream).
 *
 * The gateway is stateful (holds provider adapters + in-memory health) but
 * safe to call concurrently — all shared state is guarded by Map (atomic ops).
 */
import { randomUUID } from 'node:crypto';
import type {
  GatewayRequest,
  GatewayResponse,
  GatewayStreamChunk,
  ProviderId,
  ProviderConfig,
  AiTask,
} from './types';
import { loadProviderConfigs } from './config';
import { classifyTask } from './taskClassifier';
import { selectProviders } from './router';
import { recordSuccess, recordFailure } from './healthCheck';
import { checkUsage, recordUsage, estimateTokens } from './usageTracker';
import { GatewayError, toGatewayError } from './errors';
import type { ProviderAdapter, GenerateContext } from './providers/base';
import { GeminiProvider } from './providers/geminiProvider';
import { GroqProvider } from './providers/groqProvider';
import { OpenRouterProvider } from './providers/openRouterProvider';
import { HuggingFaceProvider } from './providers/huggingFaceProvider';

class AIGateway {
  private configs: Record<ProviderId, ProviderConfig>;
  private adapters: Partial<Record<ProviderId, ProviderAdapter>> = {};
  private initialised = false;

  /** Initialise (idempotent). Safe to call on every request. */
  init() {
    if (this.initialised) return;
    this.configs = loadProviderConfigs();
    // Instantiate adapters for enabled providers. Wrap failures so a single
    // bad provider (missing key) doesn't take the whole gateway down.
    for (const id of Object.keys(this.configs) as ProviderId[]) {
      const cfg = this.configs[id];
      if (!cfg.enabled) continue;
      try {
        switch (id) {
          case 'gemini':
            this.adapters[id] = new GeminiProvider(cfg);
            break;
          case 'groq':
            this.adapters[id] = new GroqProvider(cfg);
            break;
          case 'openrouter':
            this.adapters[id] = new OpenRouterProvider(cfg);
            break;
          case 'huggingface':
            this.adapters[id] = new HuggingFaceProvider(cfg);
            break;
        }
        console.log(`[Gateway] Provider "${id}" initialised (model: ${cfg.defaultModel}).`);
      } catch (e) {
        console.warn(`[Gateway] Failed to initialise provider "${id}":`, (e as Error).message);
        // Mark as disabled in the live config so router skips it.
        this.configs[id] = { ...cfg, enabled: false };
      }
    }
    this.initialised = true;
  }

  getConfigs() {
    this.init();
    return this.configs;
  }

  getAdapters() {
    this.init();
    return this.adapters;
  }

  /** Get a list of (id, ping) pairs for health probing. */
  getProbeTargets(): { id: ProviderId; ping: () => Promise<void> }[] {
    this.init();
    const out: { id: ProviderId; ping: () => Promise<void> }[] = [];
    for (const id of Object.keys(this.adapters) as ProviderId[]) {
      const a = this.adapters[id];
      if (a && typeof a.ping === 'function') {
        out.push({ id, ping: () => a.ping!() });
      }
    }
    return out;
  }

  /** Non-streaming generation. */
  async generate(
    req: GatewayRequest,
    userCtx: { userId: string; plan: string }
  ): Promise<GatewayResponse> {
    this.init();
    const requestId = randomUUID();
    const task = classifyTask(req);
    const chain = selectProviders(req, task, this.configs);

    // Per-user usage check (BEFORE we hit any provider).
    const usageCheck = await checkUsage(userCtx.userId, userCtx.plan);
    if (!usageCheck.allowed) {
      throw new GatewayError({
        kind: 'rate_limited_user',
        message: usageCheck.reason || 'Daily usage limit reached.',
        statusCode: 429,
        requestId,
      });
    }

    let lastError: GatewayError | null = null;
    let fellBackTo: ProviderId | undefined;

    for (let i = 0; i < chain.length; i++) {
      const providerId = chain[i];
      const adapter = this.adapters[providerId];
      if (!adapter) continue;

      const ctx: GenerateContext = {
        requestId,
        userId: userCtx.userId,
        plan: userCtx.plan,
        caller: req.caller,
      };

      try {
        console.log(
          `[Gateway] req=${requestId} task=${task} provider=${providerId} model=${req.model || adapter.config.defaultModel} caller=${req.caller || '-'}`
        );
        const res = await adapter.generate({ ...req, task }, ctx);
        // Success: record usage + health
        const tokensUsed =
          res.usage?.totalTokens ||
          estimateTokens(req.messages.map((m) => m.content).join('')) +
            estimateTokens(res.text);
        await recordUsage(userCtx.userId, userCtx.plan, providerId, tokensUsed);
        recordSuccess(providerId);

        return { ...res, fellBackTo: i > 0 ? fellBackTo : undefined };
      } catch (err) {
        const ge = toGatewayError(err, providerId);
        ge.requestId = requestId;
        lastError = ge;
        recordFailure(providerId, ge.message);
        console.warn(
          `[Gateway] req=${requestId} provider=${providerId} failed (kind=${ge.kind}, retryable=${ge.retryable}): ${ge.message.slice(0, 200)}`
        );

        // If the error is non-retryable or user explicitly disabled fallback, stop.
        if (!ge.retryable || req.noFallback) {
          throw ge;
        }
        // Otherwise, mark fallback and try next.
        if (i === 0) fellBackTo = providerId;
        continue;
      }
    }

    // All providers failed.
    throw (
      lastError ||
      new GatewayError({
        kind: 'no_provider',
        message: 'All providers failed or were unavailable.',
        statusCode: 503,
        requestId,
      })
    );
  }

  /** Streaming generation. */
  async *generateStream(
    req: GatewayRequest,
    userCtx: { userId: string; plan: string }
  ): AsyncIterable<GatewayStreamChunk> {
    this.init();
    const requestId = randomUUID();
    const task = classifyTask(req);
    const chain = selectProviders(req, task, this.configs);

    const usageCheck = await checkUsage(userCtx.userId, userCtx.plan);
    if (!usageCheck.allowed) {
      throw new GatewayError({
        kind: 'rate_limited_user',
        message: usageCheck.reason || 'Daily usage limit reached.',
        statusCode: 429,
        requestId,
      });
    }

    let lastError: GatewayError | null = null;
    let fellBackTo: ProviderId | undefined;
    let accumulatedText = '';
    let tokensUsed = 0;
    let succeededWith: ProviderId | undefined;
    let usedModel = '';

    for (let i = 0; i < chain.length; i++) {
      const providerId = chain[i];
      const adapter = this.adapters[providerId];
      if (!adapter || !adapter.generateStream) {
        // Adapter doesn't support streaming — try next.
        continue;
      }

      const ctx: GenerateContext = {
        requestId,
        userId: userCtx.userId,
        plan: userCtx.plan,
        caller: req.caller,
      };

      try {
        console.log(
          `[Gateway][stream] req=${requestId} task=${task} provider=${providerId} caller=${req.caller || '-'}`
        );
        for await (const chunk of adapter.generateStream({ ...req, task }, ctx)) {
          accumulatedText += chunk.delta;
          if (chunk.usage?.totalTokens) tokensUsed = chunk.usage.totalTokens;
          // If we fell back mid-stream, surface that to the client.
          yield fellBackTo ? { ...chunk, fellBackTo } : chunk;
        }
        succeededWith = providerId;
        usedModel = adapter.config.defaultModel;
        break;
      } catch (err) {
        const ge = toGatewayError(err, providerId);
        ge.requestId = requestId;
        lastError = ge;
        recordFailure(providerId, ge.message);
        console.warn(
          `[Gateway][stream] req=${requestId} provider=${providerId} failed (kind=${ge.kind}): ${ge.message.slice(0, 200)}`
        );
        if (!ge.retryable || req.noFallback) {
          throw ge;
        }
        if (i === 0) fellBackTo = providerId;
        continue;
      }
    }

    if (!succeededWith) {
      throw (
        lastError ||
        new GatewayError({
          kind: 'no_provider',
          message: 'All providers failed or were unavailable.',
          statusCode: 503,
          requestId,
        })
      );
    }

    // Record usage post-stream.
    if (tokensUsed === 0) {
      tokensUsed =
        estimateTokens(req.messages.map((m) => m.content).join('')) + estimateTokens(accumulatedText);
    }
    await recordUsage(userCtx.userId, userCtx.plan, succeededWith, tokensUsed);
    recordSuccess(succeededWith);
    void usedModel;
  }

  /** Image generation — bypasses the normal chat chain. */
  async generateImage(
    prompt: string,
    userCtx: { userId: string; plan: string },
    opts?: { aspectRatio?: string; count?: number }
  ) {
    this.init();
    const requestId = randomUUID();
    // Image generation only supported on Gemini (Imagen) for now.
    if (!this.configs.gemini.enabled || !this.configs.gemini.capabilities.imageGeneration) {
      throw new GatewayError({
        kind: 'no_provider',
        message:
          'Image generation is disabled. Set STACFUND_ENABLE_PAID_AI=true (paid) or add "imagen-3.0-generate-001" to STACFUND_AI_PAID_ALLOWLIST.',
        provider: 'gemini',
        statusCode: 403,
        requestId,
      });
    }
    const adapter = this.adapters.gemini as GeminiProvider;
    if (!adapter || !adapter.generateImage) {
      throw new GatewayError({
        kind: 'no_provider',
        message: 'Gemini adapter is not initialised for image generation.',
        provider: 'gemini',
        statusCode: 500,
        requestId,
      });
    }
    const usageCheck = await checkUsage(userCtx.userId, userCtx.plan);
    if (!usageCheck.allowed) {
      throw new GatewayError({
        kind: 'rate_limited_user',
        message: usageCheck.reason || 'Daily usage limit reached.',
        statusCode: 429,
        requestId,
      });
    }
    const res = await adapter.generateImage(prompt, opts);
    await recordUsage(userCtx.userId, userCtx.plan, 'gemini', 1000);
    recordSuccess('gemini');
    return { ...res, requestId };
  }

  /** Embeddings. */
  async embed(texts: string[], userCtx: { userId: string; plan: string }) {
    this.init();
    const requestId = randomUUID();
    // Try HuggingFace first, then Gemini.
    const chain: ProviderId[] = (['huggingface', 'gemini'] as ProviderId[]).filter((id) => this.adapters[id]);
    if (chain.length === 0) {
      throw new GatewayError({
        kind: 'no_provider',
        message: 'No embeddings-capable provider is enabled.',
        statusCode: 503,
        requestId,
      });
    }
    let lastError: GatewayError | null = null;
    for (const id of chain) {
      const adapter = this.adapters[id];
      if (!adapter || !adapter.embed) continue;
      try {
        const res = await adapter.embed(texts);
        const tokensUsed = estimateTokens(texts.join(''));
        await recordUsage(userCtx.userId, userCtx.plan, id, tokensUsed);
        recordSuccess(id);
        return { ...res, requestId };
      } catch (err) {
        const ge = toGatewayError(err, id);
        ge.requestId = requestId;
        lastError = ge;
        recordFailure(id, ge.message);
      }
    }
    throw (
      lastError ||
      new GatewayError({
        kind: 'no_provider',
        message: 'All embeddings providers failed.',
        statusCode: 503,
        requestId,
      })
    );
  }
}

// Singleton — one gateway per process.
export const gateway = new AIGateway();
