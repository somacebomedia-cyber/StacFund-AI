// services/ai-gateway/config.ts
/**
 * StacFund AI Gateway — Provider Configuration
 *
 * Loads provider credentials and model defaults from environment variables.
 * Enforces the Option-2 "free-first, production-ready" policy:
 *
 *   - Free providers (Gemini, Groq, OpenRouter free-tier, Hugging Face)
 *     are enabled automatically when their API key is present.
 *   - Paid providers are DISABLED unless explicitly opted in with
 *     `STACFUND_ENABLE_PAID_AI=true`. Even then, individual paid models
 *     must be added to the allowlist.
 *   - All credentials stay server-side. The client never sees them.
 *
 * Configuration is read once at boot and exposed as a frozen snapshot.
 * To change it, update .env and restart the server.
 */
import type { ProviderConfig, ProviderId, AiTask } from './types';

/**
 * Per-task preferred provider chain (lowest priority first).
 * The router walks this list and picks the first healthy, capable, enabled provider.
 *
 * Free-first ordering: Gemini first (already integrated, generous free tier),
 * then Groq (very fast, free), then OpenRouter (many free models), then HuggingFace.
 */
export const TASK_ROUTING: Record<AiTask, ProviderId[]> = {
  // Long-form, structured, requires reasoning → Gemini is best at this
  business_plan: ['gemini', 'openrouter', 'groq'],
  pitch_deck: ['gemini', 'openrouter', 'groq'],
  funding_analysis: ['gemini', 'groq', 'openrouter'],
  reasoning: ['gemini', 'openrouter', 'groq'],

  // Quick chat / summarisation → Groq first (fastest), Gemini backup
  chat: ['groq', 'gemini', 'openrouter'],
  summarization: ['groq', 'gemini', 'openrouter'],
  classification: ['groq', 'gemini', 'openrouter'],

  // Document extraction with structured JSON → Gemini (best structured output)
  document_extraction: ['gemini', 'openrouter'],

  // Vision → Gemini (free vision) is the only free option here
  image_understanding: ['gemini'],

  // Image generation — Gemini/Imagen is the only one wired up; paid-opt-in.
  image_generation: ['gemini'],

  // Embeddings — HuggingFace free inference is the cheapest
  embedding: ['huggingface', 'gemini'],

  // Default → most likely to succeed
  default: ['gemini', 'groq', 'openrouter'],
};

/**
 * Per-user request limits, per rolling 24h window.
 * Tokens are estimated from input+output characters (4 chars ≈ 1 token).
 *
 * These limits protect the platform's shared free-tier quotas from a single
 * user exhausting them. They are independent of the existing tokenQuotaService
 * (which is a UI-level estimator) — this is the real, server-enforced limit.
 */
export const USER_LIMITS: Record<string, { requests: number; tokens: number }> = {
  free: { requests: 60, tokens: 200_000 },         // ~60 requests / 200k tokens per day
  pro: { requests: 400, tokens: 1_500_000 },       // 400 / 1.5M
  business: { requests: 2000, tokens: 8_000_000 }, // 2000 / 8M
  default: { requests: 60, tokens: 200_000 },
};

export function getUserLimits(plan: string | null | undefined) {
  const key = (plan || 'free').toLowerCase().trim();
  return USER_LIMITS[key] || USER_LIMITS.default;
}

/** Read an env var as boolean. Treats '1', 'true', 'yes', 'on' as true. */
function envBool(name: string, fallback = false): boolean {
  const v = (process.env[name] || '').toLowerCase().trim();
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v);
}

/** Read a comma-separated env var into a trimmed array. */
function envList(name: string): string[] {
  const v = process.env[name] || '';
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build the provider config snapshot from environment variables.
 *
 * Env vars consumed:
 *   GEMINI_API_KEY            — Google AI Studio key (existing).
 *   GROQ_API_KEY              — GroqCloud key.
 *   OPENROUTER_API_KEY        — OpenRouter key.
 *   HF_API_TOKEN              — Hugging Face access token.
 *   STACFUND_ENABLE_PAID_AI   — Master switch to enable any paid provider/model.
 *   STACFUND_AI_PAID_ALLOWLIST — Comma-separated list of paid model ids allowed.
 *   STACFUND_AI_DISABLE_<PROVIDER> — Force-disable a provider (e.g. DISABLE_GROQ=true).
 *   GEMINI_DEFAULT_MODEL      — Override default Gemini model.
 *   GROQ_DEFAULT_MODEL        — Override default Groq model.
 *   OPENROUTER_DEFAULT_MODEL  — Override default OpenRouter model.
 *   GATEWAY_USER_LIMITS_OVERRIDE — JSON string overriding USER_LIMITS.
 */
export function loadProviderConfigs(): Record<ProviderId, ProviderConfig> {
  const paidEnabled = envBool('STACFUND_ENABLE_PAID_AI', false);
  const paidAllowlist = new Set(envList('STACFUND_AI_PAID_ALLOWLIST'));
  const isPaidModelAllowed = (modelId: string) => paidEnabled || paidAllowlist.has(modelId);

  // ── Gemini ─────────────────────────────────────────────────────────────
  const geminiKey = process.env.GEMINI_API_KEY;
  const geminiDefaultModel = process.env.GEMINI_DEFAULT_MODEL || 'gemini-3.8-flash';
  const geminiAvailableModels = envList('GEMINI_AVAILABLE_MODELS').length
    ? envList('GEMINI_AVAILABLE_MODELS')
    : [
        'gemini-3.8-flash',
        'gemini-3.8-pro',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.5-pro',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
      ];
  const geminiEnabled = !!geminiKey && !envBool('STACFUND_AI_DISABLE_GEMINI', false);

  // ── Groq ───────────────────────────────────────────────────────────────
  const groqKey = process.env.GROQ_API_KEY;
  const groqDefaultModel = process.env.GROQ_DEFAULT_MODEL || 'llama-3.3-70b-versatile';
  const groqAvailableModels = envList('GROQ_AVAILABLE_MODELS').length
    ? envList('GROQ_AVAILABLE_MODELS')
    : [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'llama-3.1-70b-versatile',
        'llama3-70b-8192',
        'llama3-8b-8192',
        'mixtral-8x7b-32768',
        'gemma2-9b-it',
      ];
  const groqEnabled = !!groqKey && !envBool('STACFUND_AI_DISABLE_GROQ', false);

  // ── OpenRouter ─────────────────────────────────────────────────────────
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openRouterDefaultModel =
    process.env.OPENROUTER_DEFAULT_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
  const openRouterAvailableModels = envList('OPENROUTER_AVAILABLE_MODELS').length
    ? envList('OPENROUTER_AVAILABLE_MODELS')
    : [
        'meta-llama/llama-3.3-70b-instruct:free',
        'meta-llama/llama-3.1-8b-instruct:free',
        'google/gemini-2.0-flash-exp:free',
        'mistralai/mistral-7b-instruct:free',
        'qwen/qwen-2.5-7b-instruct:free',
        'deepseek/deepseek-chat:free',
      ];
  const openRouterEnabled = !!openRouterKey && !envBool('STACFUND_AI_DISABLE_OPENROUTER', false);

  // ── Hugging Face ───────────────────────────────────────────────────────
  const hfToken = process.env.HF_API_TOKEN;
  const hfDefaultModel = process.env.HF_DEFAULT_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
  const hfAvailableModels = envList('HF_AVAILABLE_MODELS').length
    ? envList('HF_AVAILABLE_MODELS')
    : [
        'sentence-transformers/all-MiniLM-L6-v2',
        'sentence-transformers/all-mpnet-base-v2',
        'distilbert-base-uncased',
      ];
  const hfEnabled = !!hfToken && !envBool('STACFUND_AI_DISABLE_HUGGINGFACE', false);

  return {
    gemini: {
      id: 'gemini',
      label: 'Google Gemini',
      enabled: geminiEnabled,
      paid: false, // Gemini free tier is free for our usage pattern
      capabilities: {
        text: true,
        vision: true,
        imageGeneration: isPaidModelAllowed('imagen-3.0-generate-001'), // paid by default
        structuredOutput: true,
        toolCalling: true,
        streaming: true,
        embeddings: true,
      },
      defaultModel: geminiDefaultModel,
      availableModels: geminiAvailableModels,
      timeoutMs: 60_000,
      priority: 1,
    },
    groq: {
      id: 'groq',
      label: 'GroqCloud',
      enabled: groqEnabled,
      paid: false,
      capabilities: {
        text: true,
        vision: false,
        imageGeneration: false,
        structuredOutput: true, // Groq supports JSON mode via response_format
        toolCalling: true,
        streaming: true,
        embeddings: false,
      },
      defaultModel: groqDefaultModel,
      availableModels: groqAvailableModels,
      timeoutMs: 30_000,
      priority: 2,
    },
    openrouter: {
      id: 'openrouter',
      label: 'OpenRouter',
      enabled: openRouterEnabled,
      paid: false, // We only enable :free models by default
      capabilities: {
        text: true,
        vision: false, // Some models support it, but treat as text-only for routing
        imageGeneration: false,
        structuredOutput: true,
        toolCalling: true,
        streaming: true,
        embeddings: false,
      },
      defaultModel: openRouterDefaultModel,
      availableModels: openRouterAvailableModels,
      timeoutMs: 45_000,
      priority: 3,
    },
    huggingface: {
      id: 'huggingface',
      label: 'Hugging Face',
      enabled: hfEnabled,
      paid: false,
      capabilities: {
        text: false,
        vision: false,
        imageGeneration: false,
        structuredOutput: false,
        toolCalling: false,
        streaming: false,
        embeddings: true,
      },
      defaultModel: hfDefaultModel,
      availableModels: hfAvailableModels,
      timeoutMs: 20_000,
      priority: 4,
    },
  };
}

/** Convenience: which providers are enabled right now. */
export function getEnabledProviderIds(configs: Record<ProviderId, ProviderConfig>): ProviderId[] {
  return (Object.values(configs) as ProviderConfig[])
    .filter((c) => c.enabled)
    .sort((a, b) => a.priority - b.priority)
    .map((c) => c.id);
}

/** Whether image generation is currently allowed (paid-opt-in). */
export function isImageGenerationAllowed(configs: Record<ProviderId, ProviderConfig>): boolean {
  return configs.gemini.capabilities.imageGeneration;
}
