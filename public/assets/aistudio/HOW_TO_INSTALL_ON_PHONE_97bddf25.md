# StacFund AI — AI Gateway: phone install guide (Google AI Studio)

7 small installer files. One upload + one short message each.
File contents never pass through the chat, so you won't hit prompt limits.

## Before you start

- Your AI Studio project must be the same one you sent me (the zip).
  If you edited any of these yourself since then, tell me BEFORE running
  the parts: server.ts, pages/Dashboard.tsx, services/geminiClient.ts,
  components/OutlineEditor.tsx, utils/elementTypes.ts,
  utils/outlineStrategies.ts, .env.example, .gitignore
- Every part automatically saves a backup copy of any file it replaces,
  as <file>.bak — so you can always revert.

## The 7 steps

For each step: upload the file to the PROJECT ROOT (the folder that has
package.json), then send this message (change the file name each time):

    Run `node apply_part_1_core.cjs` and show me the full output.
    If nothing failed, delete the script.

1. apply_part_1_core.cjs       — gateway types, errors, provider config
2. apply_part_2_router.cjs     — task classifier, router, gateway engine
3. apply_part_3_providers.cjs  — Gemini, Groq, OpenRouter, HF adapters
4. apply_part_4_ops.cjs        — health checks, usage tracker, HTTP routes
5. apply_part_5_server.cjs     — server.ts + geminiClient.ts + vite-env.d.ts + .env.example
6. apply_part_6_client_ui.cjs  — client wrapper + admin panel + Dashboard
7. apply_part_7_fixes_docs.cjs — TS-error fixes + smoke test + docs + .gitignore

If a .cjs upload is ever refused, rename it to .txt, upload it, then ask
the AI to rename it back to .cjs before running.

## After step 7 — verify

Send this message:

    Run `npx tsc --noEmit` and show me the output. There should be zero
    errors. Then run `npx tsx scripts/smoke-test-gateway.ts` and show me
    what it prints.

Expected: zero TS errors, and the smoke test prints
"[smoke-test] DONE." after showing /health, /config and /usage responses.

Optional boot check — restart the dev server; the logs should include:

    [Server] AI Gateway initialised.
    [Gateway] Mounted routes under /api/ai/gateway/*

## Add your API keys (AI Studio → Secrets panel)

    GEMINI_API_KEY        required   aistudio.google.com → Get API key
    GROQ_API_KEY          optional   console.groq.com    — fast fallback
    OPENROUTER_API_KEY    optional   openrouter.ai       — extra fallback
    HF_API_TOKEN          optional   huggingface.co      — embeddings
    STACFUND_ADMIN_SECRET optional   — enables the Probe button on the panel

Any provider without a key is simply skipped — the app still boots.

## What you get

- Multi-provider AI gateway: Gemini primary, Groq/OpenRouter automatic
  fallback, Hugging Face for embeddings
- Per-user daily limits, circuit breaker, usage tracking (Firestore)
- "AI Gateway" status panel on your Dashboard
- Security fix: the old custom-Gemini-key header is disabled by default
- All previous TypeScript errors fixed (tsc reports zero errors)

## If something fails

- Send the exact output of the failed part to the AI (or to me).
- To revert any single file: copy its .bak back over it.

## Pushing to GitHub later (no PC needed yet)

Nothing is lost by waiting. When you get access to any computer:

1. Download the project from AI Studio as a zip (or use the
   StacFund-AI-main.zip in the download folder — it already contains a
   ready git commit).
2. On the computer: unzip, then
   git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
   git push -u origin main

If you're on Android and want to push from the phone itself, install
Termux, then: pkg install git -y — clone, commit and push from there.
Your PAT is typed into git on your own device, never shared with anyone.
