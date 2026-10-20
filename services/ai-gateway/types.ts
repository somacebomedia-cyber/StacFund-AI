// services/ai-gateway/types.ts
/**
 * StacFund AI Gateway — Shared Types
 *
 * These types define the contract between:
 *   - The server-side gateway (router + provider adapters)
 *   - The HTTP endpoints (/api/ai/gateway/*)
 *   - The client-side wrapper (services/aiGatewayClient.ts)
 *
 * Design principle: every request carries a `task` hint so the gateway can
 * route it to the cheapest capable provider, and every response carries enough
 * metadata (provider, model, latency, tokens) for usage monitoring without
 * the caller needing to instrument anything itself.
 */

/** Supported AI task categories. Drives provider routing. */
export type AiTask =
  | 'chat' // conversational assistant
  | 'business_plan' // long-form structured document
  | 'pitch_deck' // structured slide content
  | 'funding_analysis' // funding opportunity analysis
  | 'document_extraction' // form / PDF extraction → structured JSON
  | 'summarization' // short summary of a long input
  | 'classification' // label / route / categorise
  | 'image_generation' // logo / advert image
  | 'image_understanding' // vision input → text
  | 'embedding' // vector embedding for semantic search
  | 'reasoning' // complex multi-step reasoning
  | 'default'; // unspecified — let gateway pick

/** Capability flags a provider can declare. */
export interface ProviderCapabilities {
  text: boolean;
  vision: boolean;
  imageGeneration: boolean;
  structuredOutput: boolean;
  toolCalling: boolean;
  streaming: boolean;
  embeddings: boolean;
}

/** Provider identifier — must match ProviderConfig.id. */
export type ProviderId = 'gemini' | 'groq' | 'openrouter' | 'huggingface';

/** Provider health states used by the circuit breaker. */
export type ProviderHealth = 'healthy' | 'degraded' | 'unhealthy' | 'disabled';

/** A candidate provider the router may select. */
export interface ProviderConfig {
  id: ProviderId;
  label: string;
  /** Whether the provider is enabled at all (env key present + not opted out). */
  enabled: boolean;
  /** Whether the provider requires payment (kept disabled by default). */
  paid: boolean;
  /** Declared capabilities — drives task eligibility. */
  capabilities: ProviderCapabilities;
  /** Default model id used when the caller doesn't pin one. */
  defaultModel: string;
  /** Models the provider exposes (for admin UI + validation). */
  availableModels: string[];
  /** Optional per-request timeout (ms). */
  timeoutMs?: number;
  /** Priority for the router — lower = preferred. */
  priority: number;
}

/** A single message in a chat-style request. */
export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Optional inline image (data URL or remote URL) for vision tasks. */
  image?: {
    url: string;
    mimeType?: string;
  };
}

/** Common request shape for text-style tasks. */
export interface GatewayRequest {
  task: AiTask;
  /** Conversation history (most apps will pass a single user message). */
  messages: GatewayMessage[];
  /** Pin a specific model. If omitted, the gateway chooses. */
  model?: string;
  /** Pin a specific provider. If omitted, the gateway chooses. */
  provider?: ProviderId;
  /** Request JSON-shaped output. Provider must support structuredOutput. */
  structured?: {
    /** JSON Schema describing the desired output. */
    schema: Record<string, unknown>;
    /** Optionally require the response to be valid JSON. */
    strict?: boolean;
  };
  /** Sampling temperature (0–2). */
  temperature?: number;
  /** Max output tokens. */
  maxTokens?: number;
  /** Whether to stream the response (SSE). */
  stream?: boolean;
  /** Caller tag for logging (e.g. "AIAssistant", "FormDigitizer"). */
  caller?: string;
  /** Force-disable fallback chain (only use the primary pick). */
  noFallback?: boolean;
}

/** Non-streaming response. */
export interface GatewayResponse {
  text: string;
  /** Provider that actually answered (may differ from request.provider after fallback). */
  provider: ProviderId;
  /** Model that actually answered. */
  model: string;
  /** Latency in ms. */
  latencyMs: number;
  /** Token usage estimate (best-effort — not all providers return this). */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** Whether a fallback was triggered. */
  fellBackTo?: ProviderId;
  /** Provider-reported finish reason. */
  finishReason?: string;
  /** Request id for log correlation. */
  requestId: string;
}

/** Streaming chunk — emitted as SSE data lines. */
export interface GatewayStreamChunk {
  delta: string;
  provider: ProviderId;
  model: string;
  done: boolean;
  requestId: string;
  usage?: GatewayResponse['usage'];
  fellBackTo?: ProviderId;
}

/** Provider health snapshot — returned by /api/ai/gateway/health. */
export interface ProviderHealthSnapshot {
  id: ProviderId;
  label: string;
  enabled: boolean;
  health: ProviderHealth;
  /** Consecutive failures (used by circuit breaker). */
  consecutiveFailures: number;
  /** Last error message (if any). */
  lastError?: string;
  /** ISO timestamp of last successful call. */
  lastSuccessAt?: string;
  /** ISO timestamp of last failure. */
  lastFailureAt?: string;
  /** Default model. */
  defaultModel: string;
  /** Available models. */
  availableModels: string[];
  /** Whether this provider is paid. */
  paid: boolean;
}

/** Usage record for a single user. */
export interface UserUsageSnapshot {
  userId: string;
  plan: string;
  windowStart: string; // ISO
  requests: number;
  tokensUsed: number;
  requestLimit: number;
  tokenLimit: number;
  /** Per-provider breakdown for the current window. */
  byProvider: Partial<Record<ProviderId, { requests: number; tokens: number }>>;
}

/** Standard error shape returned by gateway endpoints. */
export interface GatewayErrorBody {
  error: {
    code: string;
    message: string;
    provider?: ProviderId;
    retryable: boolean;
    requestId?: string;
  };
}
