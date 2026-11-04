# StacFund AI - Modular Codebase Upgrade Protocol

A disciplined, chunk-by-chunk execution framework to safely integrate updated business logic, AI engines, documents studio, and UI components from the attached zip archive without token truncation or breaking changes.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following parameters have been confirmed:

- **Confirmed Decision 1 (File Delivery)**: You will upload `StacFund-upgrade-files.zip` as an attached file.
- **Confirmed Decision 2 (Prompt 1 Launch)**: As soon as the file attachment is present, Prompt 1 will execute immediately to copy the first 7 core engine files into the project.
- **Confirmed Decision 3 (Subsequent Prompts)**: Each subsequent prompt from the prompt pack will be executed individually upon receipt, replying with "Done" and the list of written files.

---

## 1. Overview & Core Concept

- **What It Does**: Upgrades StacFund AI—the premier South African SME funding opportunity discovery, automated proposal studio, business plan generator, and compliance tracking platform—with updated data engines, AI gateway integrations, and refined user flows.
- **Target Audience / Persona**: South African entrepreneurs, startup founders, and SME business owners seeking grants, equity funding, government debt finance (SEFA, IDC, NEF, NYDA, DTI, DBSA), and compliant business documentation.
- **Key Value**: Guarantees zero file truncation, pristine type synchronization, and robust validation across each upgraded module by replacing large monolithic writes with focused, verified chunk updates.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  - **Prompt Execution Flow**: User attaches `StacFund-upgrade-files.zip` and sends Prompt $\rightarrow$ Agent extracts and writes the target files in full without alteration $\rightarrow$ Agent replies with `Done` and the list of updated files $\rightarrow$ User proceeds to next prompt.
  - **Verification Gate**: At Prompt 19 and Check 1/Check 2, the agent checks file presence, verifies package dependencies, audits `firestore.rules`, and executes type checking (`npx tsc --noEmit`).
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Dark glassmorphism workspace with deep obsidian backdrops, ultra-subtle 1px border lines (`border-slate-800`), and emerald/teal accent hierarchy.
  - *Color Palette*: Canvas (`#090D16` / `bg-slate-950`), Panels (`rgba(15, 23, 42, 0.7)` with `backdrop-blur-md`), Primary Accents (`#10B981` emerald, `#06B6D4` cyan), Text (`slate-100` display, `slate-400` muted).
  - *Typography*: Plus Jakarta Sans for headers, DM Sans for body prose, tabular monospace (`tabular-nums font-mono`) for ZAR amounts, deadline counters, and percentage metrics.
  - *Anti-Slop Discipline*: Zero static pill tags on metadata, no pseudo-code headers, no arbitrary gimmick scores, single-elevation depth.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Direct Archive Extraction per Prompt**
  - *Chosen Approach*: Extract and write only the files designated in each prompt from the uploaded zip.
  - *Why*: Eliminates truncation risks and maintains complete fidelity with the user's upgrade pack.
- **Decision 2: Deferred Build Verification**
  - *Chosen Approach*: Defer `compile_applet` and type checks during intermediate steps until all dependent files arrive (at Check 1 & Check 2).
  - *Why*: Prevents false-negative compilation errors during partial delivery.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│                   StacFund AI Platform                 │
└───────────────────────────┬────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Core Engine  │    │ AI Gateway & │    │  Documents   │
│  & Matching  │    │  Providers   │    │    Studio    │
├──────────────┤    ├──────────────┤    ├──────────────┤
│ types.ts     │    │ geminiClient │    │ BusinessPlan │
│ opportunities│    │ taskClassif. │    │ Proposal     │
│ eligibility  │    │ router/quota │    │ Docx & PDF   │
└───────┬──────┘    └──────┬───────┘    └──────┬───────┘
        │                  │                   │
        └──────────────────┼───────────────────┘
                           ▼
              ┌─────────────────────────┐
              │ Firebase & Data Layer   │
              ├─────────────────────────┤
              │ Auth + User Profile     │
              │ Firestore Security Rules│
              │ Saved Applications & Doc│
              └─────────────────────────┘
```

- **Prompt 1 Target Files**:
  1. `types.ts`
  2. `services/opportunityStatus.ts`
  3. `services/opportunitiesStore.ts`
  4. `services/eligibilityEngine.ts`
  5. `services/matchingEngine.ts`
  6. `services/autofillContext.ts`
  7. `.env.example`
