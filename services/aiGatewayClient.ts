// services/aiGatewayClient.ts
/**
 * Client-side wrapper for the StacFund AI Gateway.
 *
 * This is the recommended way for React components to call AI. It:
 *   - talks to /api/ai/gateway/* (server-side gateway)
 *   - handles Firebase auth token attachment automatically
 *   - exposes a small, typed API: `generate()`, `generateStream()`,
 *     `generateImage()`, `embed()`, `getHealth()`, `getUsage()`
 *   - decodes gateway errors into a typed shape so UIs can show useful messages
 *
 * Components that previously called `createGeminiClient()` directly can be
 * migrated incrementally. The legacy client is kept for compatibility.
 */
import { auth } from './firebase';
import type {
  AiTask,
  GatewayMessage,
  GatewayRequest,
  GatewayResponse,
  GatewayStreamChunk,
  ProviderHealthSnapshot,
  UserUsageSnapshot,
  ProviderId,
} from './ai-gateway-types';

// Re-export the types so callers can `import type { ... } from '../services/aiGatewayClient'`.
export type {
  AiTask,
  GatewayMessage,
  GatewayRequest,
  GatewayResponse,
  GatewayStreamChunk,
  ProviderHealthSnapshot,
  UserUsageSnapshot,
  ProviderId,
};

const BASE = typeof window !== 'undefined' ? window.location.origin + '/api/ai/gateway' : 'http://localhost:3000/api/ai/gateway';

/** Error thrown by the client wrapper — mirrors the server GatewayError shape. */
export class AIGatewayClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly provider?: ProviderId;
  readonly statusCode: number;
  readonly requestId?: string;

  constructor(params: {
    code: string;
    message: string;
    retryable?: boolean;
    provider?: ProviderId;
    statusCode?: number;
    requestId?: string;
  }) {
    super(params.message);
    this.name = 'AIGatewayClientError';
    this.code = params.code;
    this.retryable = params.retryable ?? false;
    this.provider = params.provider;
    this.statusCode = params.statusCode ?? 500;
    this.requestId = params.requestId;
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    } catch (e) {
      console.warn('[aiGatewayClient] Failed to get Firebase ID token:', e);
    }
  }
  return headers;
}

function toClientError(status: number, body: any): AIGatewayClientError {
  const err = body?.error || body;
  return new AIGatewayClientError({
    code: err?.code || 'unknown',
    message: err?.message || `HTTP ${status}`,
    retryable: err?.retryable ?? false,
    provider: err?.provider,
    statusCode: status,
    requestId: err?.requestId,
  });
}

/** Non-streaming text generation. */
export async function generate(req: GatewayRequest): Promise<GatewayResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE}/text`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...req, stream: false }),
  });
  if (!res.ok) {
    let body: any;
    try { body = await res.json(); } catch { body = { error: { message: await res.text() } }; }
    throw toClientError(res.status, body);
  }
  return (await res.json()) as GatewayResponse;
}

/** Streaming text generation. Returns an async iterable of chunks. */
export async function* generateStream(req: GatewayRequest): AsyncIterable<GatewayStreamChunk> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE}/stream`, {
    method: 'POST',
    headers: { ...headers, Accept: 'text/event-stream' },
    body: JSON.stringify({ ...req, stream: true }),
  });
  if (!res.ok || !res.body) {
    let body: any;
    try { body = await res.json(); } catch { body = { error: { message: await res.text() } }; }
    throw toClientError(res.status, body);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.error) {
          throw toClientError(parsed.error.statusCode || 500, parsed);
        }
        yield parsed as GatewayStreamChunk;
      } catch (e) {
        // Re-throw client errors, swallow parse errors.
        if (e instanceof AIGatewayClientError) throw e;
      }
    }
  }
}

/** Image generation. Returns base64 data URLs. */
export async function generateImage(
  prompt: string,
  opts?: { aspectRatio?: string; count?: number }
): Promise<{ images: { url: string; mimeType: string }[]; model: string; requestId: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE}/image`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt, ...opts }),
  });
  if (!res.ok) {
    let body: any;
    try { body = await res.json(); } catch { body = { error: { message: await res.text() } }; }
    throw toClientError(res.status, body);
  }
  return await res.json();
}

/** Embeddings. */
export async function embed(texts: string[]): Promise<{ vectors: number[][]; model: string; requestId: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE}/embeddings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ texts }),
  });
  if (!res.ok) {
    let body: any;
    try { body = await res.json(); } catch { body = { error: { message: await res.text() } }; }
    throw toClientError(res.status, body);
  }
  return await res.json();
}

/** Get all provider health snapshots (for admin UI). */
export async function getHealth(): Promise<{ providers: ProviderHealthSnapshot[]; timestamp: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE}/health`, { headers });
  if (!res.ok) throw toClientError(res.status, await res.json().catch(() => ({})));
  return await res.json();
}

/** Actively probe providers (admin-only — requires STACFUND_ADMIN_SECRET). */
export async function probeHealth(adminSecret: string): Promise<{ providers: ProviderHealthSnapshot[]; timestamp: string }> {
  const headers = await getAuthHeaders();
  headers['x-admin-secret'] = adminSecret;
  const res = await fetch(`${BASE}/health/probe`, { method: 'POST', headers });
  if (!res.ok) throw toClientError(res.status, await res.json().catch(() => ({})));
  return await res.json();
}

/** Get the current user's usage snapshot. */
export async function getUsage(): Promise<UserUsageSnapshot> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE}/usage`, { headers });
  if (!res.ok) throw toClientError(res.status, await res.json().catch(() => ({})));
  return await res.json();
}

/** Get the safe (no secrets) provider config snapshot. */
export async function getConfig(): Promise<{
  providers: Array<{
    id: ProviderId;
    label: string;
    enabled: boolean;
    paid: boolean;
    capabilities: any;
    defaultModel: string;
    availableModels: string[];
    priority: number;
    timeoutMs?: number;
  }>;
  paidEnabled: boolean;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE}/config`, { headers });
  if (!res.ok) throw toClientError(res.status, await res.json().catch(() => ({})));
  return await res.json();
}

/**
 * Convenience helper: build a single-user-message request from a prompt string.
 * Useful for simple components that don't need full chat history.
 */
export function quickRequest(task: AiTask, prompt: string, opts?: Partial<GatewayRequest>): GatewayRequest {
  return {
    task,
    messages: [{ role: 'user', content: prompt }],
    ...opts,
  };
}
