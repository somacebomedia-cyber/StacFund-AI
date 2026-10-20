# StacFund AI — Multi-Provider AI Gateway (Option 2)

This document describes the new AI Gateway that was added to StacFund AI, how it works, and how to use it.

## What was built

A production-ready, free-first multi-provider AI Gateway that sits between your React components and the underlying AI providers (Gemini, Groq, OpenRouter, Hugging Face). It centralises provider selection, retry/fallback logic, per-user usage limits, health checks, and credential security.

### Architecture

```
React component
      │
      │  fetch('/api/ai/gateway/text', { ... })
      ▼
┌────────────────────────────────────────────────────────────┐
│                    AI GATEWAY (server)                     │
│                                                            │
│  1. Task classifier   (chat? business_plan? extraction?)   │
│  2. Router            (picks provider chain for the task)  │
│  3. Usage check       (per-user daily limits)              │
│  4. Provider adapters (Gemini, Groq, OpenRouter, HF)       │
│  5. Circuit breaker   (skips unhealthy providers)          │
│  6. Fallback chain    (retryable errors → next provider)   │
│  7. Usage recorder    (in-memory + Firestore)              │
│                                                            │
└────────────────────────────────────────────────────────────┘
      │
      ▼
   Google Gemini  /  GroqCloud  /  OpenRouter  /  Hugging Face
```

### File layout (new files)

```
services/
  ai-gateway/                          ← server-side gateway (NEW)
    types.ts                           shared TS types
    errors.ts                          GatewayError + classifier
    config.ts                          env-driven provider config + task routing
    taskClassifier.ts                  infers task from request shape
    router.ts                          picks ordered provider chain
    gateway.ts                         main facade (retry, fallback, usage)
    healthCheck.ts                     circuit breaker + health snapshots
    usageTracker.ts                    per-user 24h rolling usage (memory + Firestore)
    httpRoutes.ts                      Express handlers for /api/ai/gateway/*
    index.ts                           public exports
    providers/
      base.ts                          ProviderAdapter interface
      geminiProvider.ts                Gemini adapter (uses @google/genai SDK)
      groqProvider.ts                  Groq adapter (OpenAI-compatible, fetch)
      openRouterProvider.ts            OpenRouter adapter (OpenAI-compatible, fetch)
      huggingFaceProvider.ts           HF adapter (embeddings only)
  aiGatewayClient.ts                   ← client-side wrapper (NEW)
  ai-gateway-types.ts                  ← client-side type mirror (NEW)
  geminiClient.ts                      ← updated (BYOK disabled by default)
  geminiError.ts                       ← unchanged
  geminiInterceptor.ts                 ← unchanged (legacy compat)
components/
  AIGatewayPanel.tsx                   ← admin UI panel (NEW)
server.ts                              ← updated (mounts gateway + init usage tracker)
.env.example                           ← updated (all gateway env vars)
scripts/
  smoke-test-gateway.ts                ← boot-time smoke test (NEW)
```

## How to use it

### 1. Set your API keys

Edit `.env` (copy from `.env.example`):

```bash
# Primary provider — get one free at https://aistudio.google.com/
GEMINI_API_KEY=your_key_here

# Recommended backups — all free:
GROQ_API_KEY=your_key_here              # https://console.groq.com/
OPENROUTER_API_KEY=your_key_here        # https://openrouter.ai/
HF_API_TOKEN=your_token_here            # https://huggingface.co/settings/tokens

# Optional admin secret (for the probe button in the admin panel)
STACFUND_ADMIN_SECRET=your_admin_secret
```

### 2. Start the server

```bash
npm run dev
```

You should see:
```
[Gateway] Provider "gemini" initialised (model: gemini-2.5-flash).
[Gateway] Provider "groq" initialised (model: llama-3.3-70b-versatile).
[Gateway] Provider "openrouter" initialised (model: meta-llama/llama-3.3-70b-instruct:free).
[Gateway] Provider "huggingface" initialised (model: sentence-transformers/all-MiniLM-L6-v2).
[Gateway] Mounted routes under /api/ai/gateway/*
[Server] AI Gateway initialised.
Server running on http://localhost:3000
```

Any provider without a key is automatically disabled — the server still boots.

### 3. Use the gateway from a React component

```tsx
import { generate, quickRequest, AIGatewayClientError } from '../services/aiGatewayClient';

async function askAi(prompt: string) {
  try {
    const res = await generate(quickRequest('chat', prompt, { caller: 'MyComponent' }));
    console.log(res.text, res.provider, res.usage?.totalTokens);
  } catch (e) {
    if (e instanceof AIGatewayClientError) {
      if (e.code === 'rate_limited_user') {
        // Show the user a "you've hit your daily limit" message
      } else if (e.code === 'quota_exhausted' && e.retryable) {
        // All providers hit their quotas — try again later
      }
    }
  }
}
```

### 4. Streaming

```tsx
import { generateStream, quickRequest } from '../services/aiGatewayClient';

for await (const chunk of generateStream(quickRequest('chat', userMessage))) {
  if (chunk.delta) setOutput(prev => prev + chunk.delta);
  if (chunk.done) console.log('Stream complete. Provider:', chunk.provider);
}
```

### 5. Image generation (paid-opt-in)

By default, image generation is **disabled** because Imagen is a paid API. To enable it:

```bash
# Option A: enable all paid AI
STACFUND_ENABLE_PAID_AI=true

# Option B: allowlist just the image model
STACFUND_AI_PAID_ALLOWLIST=imagen-3.0-generate-001
```

Then:

```tsx
import { generateImage } from '../services/aiGatewayClient';
const { images } = await generateImage('A minimalist logo for a fintech startup', { aspectRatio: '1:1' });
// images[0].url is a base64 data URL — use it directly in <img src=...>
```

### 6. Admin panel

Drop `AIGatewayPanel` into any admin/dashboard view:

```tsx
import AIGatewayPanel from '../components/AIGatewayPanel';

<div className="...">
  <AIGatewayPanel adminSecret={process.env.VITE_ADMIN_SECRET} />
</div>
```

It shows live provider health, your 24h usage, and a "Probe" button to actively ping every provider.

## What was secured

### The `x-custom-gemini-key` header (BYOK) is now disabled by default

**Before:** The `requireAuth` middleware accepted an `x-custom-gemini-key` header as a complete bypass of authentication. Any client could send any string in that header and access any `requireAuth`-protected endpoint anonymously. The client-side `geminiClient.ts` also sent a user-supplied key from `localStorage` in that header on every request, which means user-supplied keys transited through the server.

**After:**
- The header is ignored unless the server explicitly opts in with `STACFUND_ALLOW_CUSTOM_GEMINI_KEY=true`.
- The client only attaches the header if `localStorage.stacfund_enable_byok === 'true'` (an admin-controlled flag).
- All provider credentials (Gemini, Groq, OpenRouter, HF) live exclusively in server-side env vars. The client never sees them.

### Provider credentials are server-side only

The new `/api/ai/gateway/*` endpoints never expose API keys to the client. The `/config` endpoint returns only safe metadata (provider id, label, default model, capabilities) — no secrets.

## What was preserved

- **Existing `/api/gemini` proxy** is unchanged. Components that still use `createGeminiClient()` from `services/geminiClient.ts` continue to work — they hit the legacy proxy, which still uses `GEMINI_API_KEY` from env.
- **`geminiInterceptor.ts`** (retry/fallback logic on the client SDK) is unchanged.
- **`tokenQuotaService.ts`** (UI-level usage estimator) is unchanged. The new gateway's `usageTracker.ts` is the real, server-enforced limit; `tokenQuotaService` is the in-UI display estimator. They are independent.
- **Firebase, Paystack, Presenton, stock-photos, scraper** — all unchanged.

## What's different from Option 1

Option 2 adds (over Option 1):
- ✅ Centralised usage monitoring (in-memory + Firestore, per-user, per-provider)
- ✅ Per-user request + token limits (configurable per plan)
- ✅ Provider health checks with circuit breaker (3 strikes → 1 min cooldown → half-open probe)
- ✅ Configurable model selection (env vars + caller can pin model/provider per request)
- ✅ Better error handling (typed `GatewayError` with `kind` + `retryable` + `statusCode`)
- ✅ Retry/fallback chain (retryable errors automatically try the next provider)
- ✅ Optional paid providers (disabled by default, opt-in via env)
- ✅ Admin UI panel showing live status

## How task routing works

The gateway uses a deterministic, free-first routing table (no LLM-as-router). From `services/ai-gateway/config.ts`:

| Task | Provider chain (in order) |
|------|---------------------------|
| `business_plan` | Gemini → OpenRouter → Groq |
| `pitch_deck` | Gemini → OpenRouter → Groq |
| `funding_analysis` | Gemini → Groq → OpenRouter |
| `reasoning` | Gemini → OpenRouter → Groq |
| `chat` | Groq → Gemini → OpenRouter (Groq is fastest) |
| `summarization` | Groq → Gemini → OpenRouter |
| `classification` | Groq → Gemini → OpenRouter |
| `document_extraction` | Gemini → OpenRouter (need structured JSON) |
| `image_understanding` | Gemini (only free vision option) |
| `image_generation` | Gemini (Imagen, paid-opt-in) |
| `embedding` | HuggingFace → Gemini |
| `default` | Gemini → Groq → OpenRouter |

If the caller doesn't set `task`, the task classifier infers it from message content (keyword-based, deterministic).

## Per-user limits (rolling 24h)

From `services/ai-gateway/config.ts`:

| Plan | Requests/day | Tokens/day |
|------|--------------|------------|
| free (default) | 60 | 200,000 |
| pro | 400 | 1,500,000 |
| business | 2,000 | 8,000,000 |

Override with `GATEWAY_USER_LIMITS_OVERRIDE` env var (JSON). Limits are checked **before** any provider is called — a user over their limit never consumes a provider's quota.

## API reference (server-side endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/ai/gateway/text` | required | Non-streaming text generation |
| `POST` | `/api/ai/gateway/stream` | required | Streaming text generation (SSE) |
| `POST` | `/api/ai/gateway/image` | required | Image generation (paid-opt-in) |
| `POST` | `/api/ai/gateway/embeddings` | required | Vector embeddings |
| `GET`  | `/api/ai/gateway/health` | optional | Provider health snapshot |
| `POST` | `/api/ai/gateway/health/probe` | admin | Actively probe every provider |
| `GET`  | `/api/ai/gateway/usage` | required | Current user's 24h usage |
| `GET`  | `/api/ai/gateway/config` | optional | Safe (no secrets) provider config |

## Smoke test

A boot-time smoke test is included:

```bash
npx tsx scripts/smoke-test-gateway.ts
```

It boots a minimal Express server (no Vite, no Firebase), mounts the gateway, and exercises the `/health`, `/config`, and `/usage` endpoints. If `GEMINI_API_KEY` is set in env, it also fires a 1-token "hi" prompt at Gemini to verify end-to-end.

## Migration path (for existing components)

The legacy `/api/gemini` proxy and `createGeminiClient()` are kept for backward compatibility. To migrate a component to the new gateway:

1. Replace `import { createGeminiClient } from '../services/geminiClient'` with `import { generate, quickRequest } from '../services/aiGatewayClient'`.
2. Replace `const client = await createGeminiClient(); const res = await client.models.generateContent({ ... })` with `const res = await generate(quickRequest('chat', prompt, { caller: 'MyComponent' }))`.
3. Replace `res.text` access — it's still `res.text` in the new response shape, so this is usually a no-op.
4. For streaming, use `generateStream()` instead of `generateContentStream()`.
5. For structured JSON output, use the `structured` field on the request instead of `responseMimeType`.

Components using Gemini that haven't been migrated: `AIAssistant.tsx`, `AILogoGenerator.tsx`, `AdvertGenerator.tsx`, `AIFundingInsights.tsx`, `FundingNeedsTracker.tsx`, `FormDigitizer.tsx`, `WhatsAppIngestion.tsx`, `ApplicationWorkflow.tsx`, `PresentationDesigner.tsx`, `Dashboard.tsx`, `ProfileForm.tsx`. These all continue to work via the legacy proxy — migration is purely opt-in.

## What's NOT in this change (future work)

- Hugging Face for text generation (currently HF is embeddings-only in our routing)
- A/B testing between providers
- Cost tracking (we track tokens, not $ — would need a pricing table per model)
- Multi-region routing
- Redis-backed shared state for horizontal scaling (currently in-memory only — fine for single-instance)

These can be layered on top of the existing gateway without changing its public API.
