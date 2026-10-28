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


## Proposal Studio — Canva-style funding proposal builder (2026-10-26)

**What this is.** The presenton/Gamma "outline first → fill each section"
pipeline, applied to flowing funding-proposal documents (the existing
OutlineEditor/PresentationDesigner pair already did this for slide decks).
The old `generateBusinessPlan()` single-shot flow is untouched — Proposal
Studio is a new tool alongside it.

**New files**

- `services/proposal/proposalSchema.ts` — typed document model:
  `ProposalDocument` = meta (cover fields) + `ProposalSection[]`
  (kind, title, brief, keyPoints, paragraphs, bullets, stats, table,
  include, status). Section taxonomy of 13 kinds with labels + briefs.
- `services/proposal/proposalTemplates.ts` — premium template registry,
  data-only. Three templates: **Protea** (warm editorial, Cormorant
  Garamond, cream/terracotta), **Baobab** (corporate, Unbounded,
  navy/gold), **Umzansi** (minimal, Inter, emerald). Each exposes accent
  swatches; `withAlpha`/`readableInkOn` color helpers.
- `services/proposal/proposalGenerator.ts` — two-stage generator.
  Stage 1 `generateProposalOutline()` (one fast call, structured output,
  6–9 sections, exec-summary-first and funding-request guaranteed).
  Stage 2 `fillProposalSection()` (per-section focused call; optional
  user rewrite instruction). `buildComplianceSection(ctx)` builds the
  eligibility + documents checklist **deterministically** from the
  AutofillContext — never AI-written. `buildMinimalContextBlock()` for
  no-funder mode.
- `components/proposal/ProposalPages.tsx` — ONE shared renderer, three
  looks: CoverPage / SectionPage / ClosingPage + TemplateMiniPreview
  (WYSIWYG gallery thumbnail = the real cover, scaled). A4 at 794×1123px,
  `.pdf-page` class, min-height pages so content grows and the exporter
  slices instead of cropping. `[square-bracket]` AI placeholders render
  highlighted in the accent color.
- `components/proposal/ProposalStudio.tsx` — the 4-step UX shell:
  template gallery (live accent preview) → setup (profile prefill,
  opportunity linking via `buildAutofillContext`, eligibility chip,
  live cover preview) → outline review (edit/reorder/include/exclude/
  add sections before long generation) → editor (side-panel editing of
  every field incl. table cells, per-section ✨Rewrite, template switch,
  accent picker, zoom, live preview, persistent Download PDF). Export
  reuses `utils/pdfExporter.exportElementsToPdf` with 'slice' mode.

**Wiring**

- `pages/Dashboard.tsx` — imports ProposalStudio; `showProposalStudio`
  state; `handleToolClick` + `open_ai_tool` event handler accept
  `'proposal'`; new "Proposal Studio" Smart Tools card (PRO-gated like
  the other AI tools, free users see the upgrade overlay); modal mounted
  alongside PresentationDesigner.

**Design decisions worth remembering**

- Client-side PDF export (html2canvas + jsPDF via the shared
  pdfExporter) — NOT server-side Playwright. The exporter is
  battle-tested here (font-wait, CORS isolation, no-crop slicing) and
  needs zero new infra. Ancestor `transform: scale()` on the preview
  does not affect html2canvas capture, so zooming is free.
- Fonts (Inter, Lato, Cormorant Garamond, Unbounded) were already
  loaded in index.html — templates deliberately reuse them so
  `document.fonts.ready` in the exporter covers everything.
- The Firestore `doc()` helper vs a `doc` memo name collision was
  caught before runtime (memo renamed `proposalDoc`).
- React 19 bundled types reject the special `key` prop on precisely
  typed plain function components — affected components are typed
  `React.FC`.

**Verification**

- `tsc --noEmit` → 0 errors.
- `npm run build` → client + server bundles build clean (the >500kB
  chunk warning predates this work).
- Not yet exercised end-to-end (needs a real GEMINI_API_KEY + login):
  outline generation, section fill, PDF download. These go through the
  same `/api/gemini/` proxy as the existing generators.

**Deliberately out of scope (future work)**

- Saving proposals to Firestore (`proposals` collection; resume later,
  versioning, attach-to-application)
- AI-generated cover imagery via the gateway (per-template hero art)
- Brand kit (logo upload + accent extraction) per user
- DOCX export alongside PDF
- Inline click-to-edit directly on the preview (currently side-panel)
- An `open_funding_proposal` tool-call in AIAssistant's function
  schema (the Dashboard handler already accepts `'proposal'`, so only
  the assistant-side declaration remains)

---

## Business Plan Studio — long-form, Venturekit-class (2026-10-26)

The full 70–120 page funder-ready **business plan** generator, distinct from
the short Proposal Studio (8–15 page funding proposals). Text-first,
professional and sober: serif body, one accent colour, thin rules, stat chips,
clean tables and minimal SVG charts — no stock imagery, no decorative
graphics, text-based (selectable/searchable) PDF export.

### New files

| File | Role |
|---|---|
| `services/businessPlan/planSchema.ts` | Typed model: chapters → subsections → 11 block types (paragraph, twoCol, stats, table, swot, kv, chart, sources, callout…), word counting, page estimation, AI-JSON → typed-block coercion |
| `services/businessPlan/planDepth.ts` | **The 70–120 page contract.** Funder classification (SEFA/IDC/NEF/bank/grant/ESD), amount-band base pages + funder modifiers, hard clamps [70,120], word-budget allocation with funder-specific chapter emphasis |
| `services/businessPlan/planStructure.ts` | The 14-chapter catalog (Venturekit-inspired, SA-adapted): required subsections + expansion pools per chapter; block "recipes" (shape contracts) per subsection |
| `services/businessPlan/planGenerator.ts` | Pipeline: ONE tailoring call (offerings, business models, personas, chapter summaries) → deterministic skeleton with per-subsection word budgets → per-subsection fills with word-count enforcement + corrective expansion retry. Deterministic document checklist from AutofillContext. localStorage checkpointing; key-claim tracking for cross-section numeric consistency |
| `components/businessPlan/planPaginate.ts` | Exact A4 pagination: cover, deterministic TOC (real page numbers), chapter openers, subsection pages, keep-with-next, over-tall table splitting with repeated headers |
| `components/businessPlan/PlanBlocks.tsx` | Sober institutional renderers, all inline-styled (self-contained export HTML): 4 accent themes, stat chips, two-col lists, tables, SWOT grid, minimal SVG bar/line/donut charts, running header/footer "X of N" |
| `components/businessPlan/PlanEditorPanel.tsx` | Editor side panel: cover fields + per-block editors (every block type) + reorder/delete + AI rewrite with instructions |
| `components/businessPlan/PlanSetupPanel.tsx` | Setup step with the live depth verdict (target pages, band, words, time, AI-credit usage vs quota) and theme picker |
| `components/businessPlan/BusinessPlanStudio.tsx` | The shell: Setup → Outline review (drop/add sections) → Writing (per-section progress, cancel, checkpointed) → Editor (chapter tree + paginated WYSIWYG preview + side panel + Download PDF). **Auto-deepen** (expands with pool sections until the page floor is met, ≤3 rounds) and **auto-trim** (drops optional sections past the 120-page ceiling) |
| `utils/planPdfExport.ts` | Text-PDF export: serialises preview pages → standalone HTML → server Playwright print; canvas image-PDF fallback |
| `scripts/verify-plan-engine.ts` | `npm run verify:plan` — depth contract, budgets, skeleton, pagination, table-splitting checks (all pass) |

### Changed files

- `server.ts` — new `POST /api/plan/export-pdf` (requireAuth, text/plain body
  32MB, Playwright Chromium → A4 text PDF via `preferCSSPageSize`).
- `components/ApplicationWorkflow.tsx` — "Generate Business Plan" now opens
  the Business Plan Studio prefilled with this opportunity + amount + purpose
  (replaces the old ~800-word single-shot call and the GammaPitchLayout
  preview modal).
- `pages/Dashboard.tsx` — Business Plan Studio card in Smart Tools (flagship
  position), `business_plan` tool in `handleToolClick` + `open_ai_tool`
  handler (accepts `detail.prefill`), studio mount.
- `firestore.rules` — `users/{uid}/plans/{planId}` (save/resume plans).
- `index.html` — Source Serif 4 font (institutional serif).
- `package.json` — `verify:plan` script.

### How the length contract works

1. `classifyFunder(issuer, funding_type)` → category (DFI, bank, micro, grant…).
2. Base pages from the amount band (≤R250k → 68 … >R20m → 106), + category
   modifier (DFI +8, bank +6, micro −6), clamped to [70, 120].
3. Word budget = (target − structural pages) × 360, allocated across chapters
   with funder emphasis (banks → financials; DFIs → market + impact).
4. Per-subsection budgets → AI fills with word-count enforcement + retry.
5. Editor auto-deepens (adds catalog sections) until the page floor is met;
   auto-trims optional sections past 120.

### Verification

- `tsc --noEmit` → 0 errors. `npm run build` → clean client + server bundles.
- `npm run verify:plan` → ALL CHECKS PASSED (depth scenarios incl. SEFA
  micro R150k → 70p, bank R3m → 92p, IDC R30m → 114p; budget math; pagination
  numbering; over-tall table splitting).
- Server boot smoke test: `/api/health` 200; `/api/plan/export-pdf` correctly
  401s without auth.
- End-to-end generation needs a live GEMINI_API_KEY + login (same
  `/api/gemini/` proxy as all existing generators).

### Known follow-ups

- The generation loop is client-side (consistent with every other AI feature);
  a server-side job runner would help very slow connections.
- Charts are AI-data-driven; financial figures inside them are placeholders
  until the financials module is wired in.
- Second template family (sans-serif) and DOCX export.

---

## Post-launch studio upgrades (2026-10-26)

Five upgrades shipped on top of the Business Plan Studio and Proposal Studio:
real financial figures, Firestore persistence (save/resume), Word (.docx)
export, a Brand Kit with logo, and AI-assistant (voice-ready) studio launching.

### 1. Real financial figures in the Financial Plan chapter

- **New `services/businessPlan/planFinancials.ts`** — the bridge between the
  user's Funding Needs Tracker (`users/{uid}/funding_needs`) and the plan:
  - `summarizeFundingNeeds()` reduces the register (drops already-`received`
    and zero-cost items, sorts by cost) into totals, coverage % and gap vs the
    amount requested.
  - `buildUseOfFundsSubsection()` builds the **deterministic** "Funding
    Requirement & Use of Funds" subsection in code: itemised table (item /
    amount / % / basis-quotation), total row, reconciliation callout (exact
    match / shortfall / surplus) and stat chips. Never AI-estimated.
  - `fundingNeedsContextBlock()` is injected into EVERY fill prompt with the
    rule "use these exact Rand amounts; never invent alternatives".
  - `fundingClaimsFromSummary()` seeds the key-claims consistency tracker so
    all ~50 sections stay numerically consistent with the register.
- `planGenerator.ts`: `PlanGenRequest.fundingNeedsSummary`; the skeleton
  swaps the AI `funding_plan` subsection for the deterministic one when a
  register exists (AI fallback preserved when it doesn't).
- Studio: register loaded on mount; live "Financials — your real figures"
  card in Setup (count / total / coverage / shortfall warning); deterministic
  sections show a shielded note instead of AI Rewrite (figures are protected,
  blocks still directly editable).

### 2. Firestore persistence (save / resume)

- **New `services/studioDocs.ts`** — save/list/get/delete for
  `users/{uid}/plans/{id}` (business plans, with the generation request so
  AI rewrite works after resume) and `users/{uid}/proposals/{id}`. Docs carry
  denormalised summaries (title, words, page estimate) for cheap lists.
- Business Plan Studio Setup: "Your saved plans" list (Open / Delete) plus
  the existing interrupted-generation resume banner. Cloud autosave 45s
  after the last edit in the editor; manual Save retained.
- Proposal Studio: previously had NO persistence — now "Continue a saved
  proposal" on the template step, Save button + 30s autosave in the editor.
- `firestore.rules`: `proposals/{id}` and `brand_kit/{id}` added (owner-only).

### 3. Word (.docx) export

- **New `docx@9` dependency** + `services/docx/docxShared.ts` (shared sober
  design system: Cambria body / Calibri headings, accent-tinted tables,
  stat chips, callouts, chart→data-table), `services/docx/planDocx.ts`
  (cover with brand logo, live Table of Contents field with
  `updateFields:true`, Heading 1/2 per chapter/section, page-of-total
  footers, repeating table headers) and `services/docx/proposalDocx.ts`.
- Server: `POST /api/plan/export-docx` and `POST /api/proposal/export-docx`
  — auth-gated, text/plain JSON transport (same pattern as export-pdf,
  bypasses the global 100kb json limit), brand payload sanitised server-side.
- Client: `utils/studioDocxExport.ts`; "Word" buttons in both studio headers.
- `server.ts` now respects `process.env.PORT` (PaaS-friendly; 3000 default).

### 4. Brand Kit (logo + accent + tagline)

- **New `services/brandKit.ts`** (`users/{uid}/brand_kit/main`): logo stored
  as a ≤480px PNG data URL (client-side canvas downscale, size-guarded),
  accent hex, trading name, default tagline.
- **New `components/BrandKitPanel.tsx`** on the Dashboard Tools tab.
- Applied automatically: plan covers (logo + "Brand accent" theme generated
  from the hex via `makePlanThemeFromAccent`), proposal covers (logo +
  default accent), PDF exports (logo is part of the rendered pages) and
  DOCX exports (logo + accent headings).

### 5. AI assistant (voice-ready) studio launching

- `AIAssistant.tsx`: new `open_business_plan_studio` (optional amount/purpose
  args → prefills the studio) and `open_proposal_studio` function tools.
  Speech input already flows through the same path, so "open my business
  plan" works by voice. System prompt capabilities updated.

### Verification

- `npm run verify:studio` (new) → 42 checks: funding-needs math, deterministic
  use-of-funds content, skeleton wiring (register on/off), brand-kit guards,
  real .docx buffers (PK zip + document.xml) for plan and proposal.
- `npm run verify:plan` → still ALL PASS (page contract unchanged).
- `npx tsx scripts/smoke-test-docx-endpoints.ts` (new) → compiled server
  boots; both DOCX routes auth-gated; forged AND well-formed fake JWTs
  rejected (admin verification active); routes not 404.
- `tsc --noEmit` → 0 errors; `npm run build` → clean client + server.

### Remaining follow-ups

- AI cover art and inline click-to-edit (Phase 2 of the studio roadmap).
- Charts remain SVG data-driven; the deterministic register now feeds the
  prose and tables, but chart series are still AI-populated.

## Patch 2 review + hardening (2026-10-27): official-form autofill, one opportunity list

Claude Sonnet's patch 2 was reviewed line by line, merged **by hand** onto the
current tree (its Dashboard/Explorer/Heatmap replacements were built against a
pre-upgrade snapshot and would have wiped the eligibility engine, the shared
opportunity store, alerts and both studios), then hardened. 91 checks in
`npm run verify:form` (new) all pass; records/plan/studio suites unchanged.

### What was merged from the patch

- `services/formModel.ts`, `services/formAutofill.ts` (pdf-lib engine),
  `services/formTemplates/{index,kznYouthFund2026}.ts`,
  `components/FormAutofillWizard.tsx`, `public/assets/forms/kzn-youth-fund-2026-27.pdf`
  (byte-identical to the official form, sha256-verified).
- `services/opportunityStatus.ts`: gained `isPublicRecord`, `mergeOpportunities`,
  `describeClosing` (all consumers re-verified).
- Explorer detail panel: closing date with days left, funding tiers, how to
  apply (+ "Emailed applications are not accepted"), documents, excluded
  sectors, contact + "Checked by a person on …".
- "Fill the official form" button + lazy-loaded wizard on the KZN fund screen.
- Dashboard AI assistant no longer receives CLOSED opportunities.
- Heatmap dots now come from the shared list (published records get dots too).

### One store, not two

The patch's `services/useOpportunities.ts` duplicated
`services/opportunitiesStore.ts` (two caches, two inflights). Instead the two
were fused: the store now has the patch's 60s TTL + `builtInOpportunities()` +
a `useOpportunities()` React hook, and keeps invalidation events (admin
publish/reject refreshes every consumer instantly), `getOpportunityById` and
`getCachedOpportunities`. Only one module owns the list.

### Bugs found by the review (fixed)

1. **Cents became rand.** Pasting "350000.50" into any amount field produced
   R35 000 050: the decimal separator was stripped and the cents glued on as
   extra digits. Fixed at every layer — `stripTrailingCents()` in formModel
   (used by `toInt`), `groupDigits`, and the wizard's input filter.
2. **The feature was invisible.** No built-in record matched the KZN template,
   so the "Fill the official form" button could never appear unless an admin
   had published one. Added `kzn_youth_fund_2026_27` to MOCK_FUNDING (38
   records now, all pass the publish validator), mirroring the official form's
   thresholds, documents, excluded sectors and eligibility rules.
3. **Legal-form hard-fails for real profiles.** `PTY_LTD` (older synth) and
   "Not specified" (OnboardingWizard) profiles failed every record with
   human-readable `legal_form_required`. The engine now maps entity codes to
   readable names and treats "Not specified" as unknown, not fail.
4. **Excluded-sector matching was substring-only.** "Minibus taxi operator"
   never matched the official wording "Taxis: minibus, coach or app-operated".
   Now token-overlap with stopwords, so official exclusion wording works.
5. **Cryptic PDF failures.** An encrypted or damaged form PDF now produces a
   plain-language error instead of pdf-lib's.
6. **Unbounded numeric input.** Amounts capped at 9 digits, jobs at 4,
   ownership % at 3; `toInt` clamps absurd pastes.

Also hardened: Esc closes the wizard; every DrawOp is bounds-checked against
its page's media box (verified in the test, none out of bounds); the PDF asset
is verified unencrypted, unrotated, 8 pages A4; the saved output is read back
and the drawn values are found on the right pages; page 4 is checked to never
contain a drawn signature date.

### Not done (from the patch's own list)

- More forms (NYDA, SEFA …): each needs its PDF measured like
  `kznYouthFund2026.ts` shows.
- Whether form-filling should be Pro-only is still the owner's call.
