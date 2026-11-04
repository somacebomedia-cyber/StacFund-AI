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

---

# Post-patch work (2026-10-23)

This section documents the work that closed out the six items the patch README
left as "Not done yet". All work was committed on top of the patch — the
patch's 12 files are unchanged; the additions below are new files and small
edits.

## What was added on top of the patch

### New files

| File | Purpose |
|------|---------|
| `services/opportunitiesStore.ts` | Browser-side store for the published-opportunity list. Merges Firestore `funding_opportunities` (reviewed & published) with the built-in `MOCK_FUNDING` list, re-derives status from dates, caches the result, exposes `loadOpportunities(force?)` and an `invalidateOpportunities()` event the admin intake screen can fire after a publish. |
| `services/eligibilityEngine.ts` | Hard-rule eligibility: pass/fail/unknown verdict per rule (age, province, legal form, excluded sectors, sector allowlist, youth ownership). Returns human-readable reasons. Used by the matching engine, the autofill context, the user-alerts fan-out, and the FundingCard badge. |
| `services/autofillContext.ts` | Builds one structured "AutofillContext" (prompt block + tiers + required documents + matched/missing documents + eligibility verdict + suggested funding tier) from the user's Firestore profile + an opportunity. Used by `ApplicationWorkflow.handleAutoFill()` / `generateBusinessPlan()` and `FormDigitizer.analyzeForm()`. |
| `services/userAlerts.ts` | Server-side. When an admin publishes an opportunity, walks every user's profile, evaluates eligibility, and notifies eligible users via in-app notification + email (SMTP) + WhatsApp (Twilio) + push (FCM). Silent no-op per channel when env vars are missing. De-duplicates via `users/{uid}/alerts_sent/{oppId}`. |
| `components/AlertPreferences.tsx` | Per-user alert-preferences UI. Email / WhatsApp / push opt-ins, frequency (immediate or daily digest). Mounted on the Dashboard's Tools tab. Calls the new `/api/alerts/prefs` and `/api/alerts/device-token` endpoints. |
| `scripts/verify-builtin-records.ts` | Programmatic half of the README's task 6. Runs each `MOCK_FUNDING` entry through `publishProblems()` and exits 0 when all 37 are publishable, 1 otherwise. Wired as `npm run verify:records`. |
| `VERIFICATION_REPORT.md` | Operational hand-off for task 6. Documents the script's result (37/37 OK), what the script does and does not check, and the human workflow that completes the verification. |

### Replaced / extended files

| File | What changed |
|------|--------------|
| `services/matchingEngine.ts` | Now wraps each score with the hard-rule eligibility verdict. `getMatchMeOpportunities()` and `getApplyReadyOpportunities()` exclude opportunities that fail a hard rule (keep the ones that are `unknown`, because the user might just be missing profile data). Returns `hardRules` on each item so the UI can show a verdict badge. |
| `services/opportunityIntake.ts` | `publishDraft()` now fires `notifyMatchingUsers(db, record)` after the Firestore batch commits. Fire-and-forget; never blocks the publish and never throws. |
| `services/advancedScraper.ts` | Source list replaced with deep links (NYDA Grant Programme, TIA Seed Fund, IDC Apply for Funding, DTIC scheme pages, Seda, SEDFA, etc.). Added three KZN Online entries — the README explicitly mentioned `kznonline.gov.za` as missing. Expanded the cron-on-server caveat in the file header: explains when to use Cloud Scheduler / cron-job.org / GitHub Actions instead of the in-process cron. |
| `components/FundingCard.tsx` | New optional `eligibilityReport` and `matchReason` props. When `eligibilityReport` is set, the card shows a green / amber / red verdict badge with the blocking reasons and missing-data reasons. |
| `components/ApplicationWorkflow.tsx` | Builds the autofill context on mount. `handleAutoFill()` now also fills `fundingRequested` with the smallest tier's max amount when the opportunity has named tiers. `generateBusinessPlan()` now uses the real `eligibility_summary`, `thresholds`, `required_documents`, and the eligibility verdict (replaces the old `eligibility_criteria` reference, which referenced a non-existent field and always fell back to "General requirements"). Step 1 shows three new banners: hard-rule blockers, missing profile data, and documents to attach. |
| `components/FormDigitizer.tsx` | New optional `opportunityId` prop. When set, the digitizer builds the autofill context and uses it in the AI prompt (so the form fills reflect the funder's real eligibility rules / tiers / required docs). Falls back to the legacy `localStorage` snapshot when no opportunity is passed. |
| `components/WhatsAppIngestion.tsx` | The publish and reject handlers now dispatch a `stacfund_opportunities_invalidated` window event, so the Dashboard and FundingExplorer drop their cached opportunity list and re-fetch. |
| `pages/Dashboard.tsx` | `MOCK_FUNDING` removed everywhere (5 call sites). All UI now reads from `loadOpportunities()` (Firestore-published + built-in fallback, with live-refresh on publish). The "Tools" tab now includes the `AlertPreferences` panel. |
| `pages/FundingExplorer.tsx` | The local Firestore fetch is replaced with the shared `loadOpportunities()` helper (same caching + invalidation). `fetchProfile()` now reads the user's `province` and the owner's `age` from Firestore so the hard-rule eligibility has real data to evaluate. DISCOVER and TIMELINE modes now attach a `hardRules` verdict to each card. MATCH_ME and APPLY_READY filter via the new matching engine. |
| `server.ts` | New endpoints: `GET /api/alerts/prefs`, `PUT /api/alerts/prefs`, `POST /api/alerts/device-token`. All `requireAuth`-protected. The PUT validates the body shape (boolean opt-ins, email regex, phone E.164 normalisation). |
| `.env.example` | New env-var blocks: SMTP (host/port/user/pass/from), TWILIO (sid/token/whatsapp-from), FCM_SERVER_KEY. All commented and clearly marked optional. |
| `package.json` | Added `nodemailer` to dependencies. New scripts: `verify:records` (runs the new verifier), `smoke:gateway` (runs the existing gateway smoke test). |

## What task 6 (verify 37 records) did and did not do

`npm run verify:records` runs each built-in record through `publishProblems()`
— the same validator the admin publish button uses. As of this run, **all
37 records pass**, so they would all publish without edits.

What it does NOT check (and what the README's "run each through the review
screen" implies): whether the closing date is current, whether the
application URL still resolves, whether the contact email is still
monitored. That remains a human workflow — see `VERIFICATION_REPORT.md` for
the step-by-step.

## What's still NOT in this change

- Hugging Face for text generation (HF stays embeddings-only)
- A/B testing between providers
- Cost tracking (token → $ conversion per model)
- Multi-region routing
- Redis-backed shared state for horizontal scaling
- A dedicated `/admin/gateway` route (the inline Dashboard panel still
  works; a full admin page is a separate task)
- FCM token registration from the browser (the `/api/alerts/device-token`
  endpoint exists; the client-side `firebase-messaging` SW + `getToken()`
  wiring is left to a future PR)
- The admin intake review screen for the 37 built-in records. The
  `verify-builtin-records.ts` script covers the structural half; the
  content-accuracy half is still a human workflow.

