# Recharts Funding Progress Analytics, Application Funnel & Chatbot Multimodal Attachment

Comprehensive architecture and design plan to integrate a side-by-side Recharts analytics dashboard (active applications vs. total funding goals with an application stage funnel) and enable multimodal file attachments (images, PDFs) in the StacFund AI assistant chatbot.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed during Phase 1:
> - **Layout Placement**: A dedicated analytics section on the Dashboard Overview tab displaying the Funding Goal Progress and the Application Stages Funnel side-by-side in a responsive 2-column glassmorphism grid.
> - **Goal Calculation & Configuration**: Computed automatically from the user's `funding_needs` total, with an interactive in-place editor to customize and override the target goal benchmark at any time.
> - **Chatbot Multimodal Intelligence**: Uploaded images and PDF documents are parsed and fed directly to Gemini 2.5/Flash as multimodal inline parts, triggering a comprehensive document readiness, compliance, and funding viability review with actionable feedback.

---

## 1. Overview & Core Concept

This feature set elevates StacFund from a tracking table to an institutional-grade financial command center and smart AI copilot:

1. **Funding Progress vs. Target Goal Analytics (`components/FundingAnalyticsSection.tsx`)**:
   - Visualizes the gap between the entrepreneur's cumulative funding target and their actual funding pipeline (Drafted, Submitted, Under Review, Approved).
   - Shows capital coverage percentage, shortfall deficit, and distribution by funding instrument (Grants, Loans, Equity) using Recharts.
   - Allows users to directly calibrate their target goal (e.g. R500,000, R1,500,000) with instant recalculation.

2. **Application Conversion Funnel (`components/ApplicationFunnelChart.tsx`)**:
   - Visualizes pipeline momentum through the 5 funding lifecycle stages: *Draft Preparation* $\rightarrow$ *Submitted to Allocator* $\rightarrow$ *Under Due Diligence / Review* $\rightarrow$ *Approved / Awarded* (with *Rejected / Resubmission Needed* tracking).
   - Computes stage conversion rates and identifies bottlenecks in the founder's funding journey.

3. **Chatbot Multimodal Document & Image Attachment (`components/AIAssistant.tsx`)**:
   - Adds a paperclip/camera upload button in the chatbot message composer.
   - Supports image uploads (`image/png`, `image/jpeg`, `image/webp`) and PDF pitch decks/financials (`application/pdf`).
   - Displays an attachment preview pill with thumbnail, file name, and one-click remove.
   - Passes base64 payload to the Gemini API (`@google/genai`) for real-time document critique, gap detection (e.g. missing tax clearance, unclear revenue model), and proposal advice.

---

## 2. User Experience & Visual Design

### A. Layout Structure & Section Rhythm
In `pages/Dashboard.tsx` (`overview` tab), the new section sits between the Quick Stats Grid and the Funding Countdown / AI Insights:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Welcome Back Banner & Founder Level XP Progress Bar                   │
├────────────────────────────────────────────────────────────────────────┤
│  Quick Stat Cards (Applications · Submitted · Documents)               │
├────────────────────────────────────────────────────────────────────────┤
│  [NEW] Funding Command Center: Goal Progress & Stage Funnel (Recharts) │
│  ┌──────────────────────────────────┐ ┌──────────────────────────────┐ │
│  │ Card A: Funding Pipeline vs Goal │ │ Card B: Stage Funnel Chart   │ │
│  │ · Recharts Bar / Radial Progress │ │ · Recharts Funnel & Metrics  │ │
│  │ · Goal Calibration (Edit Target) │ │ · Stage Drop-off Rates       │ │
│  └──────────────────────────────────┘ └──────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│  Funding Countdown & Cutoff Radar (< 48h Cutoff Alerts)                │
├────────────────────────────────────────────────────────────────────────┤
│  AI Funding Insights & Industry Trends                                 │
└────────────────────────────────────────────────────────────────────────┘
```

### B. Visual Identity & Styling
- **Aesthetic Direction**: Dark glassmorphism (`#0A0A18` / `#0D0D20` backdrop blur), hairline white borders (`border-white/10`), ambient neon accents (`cyan-500`, `purple-500`, `emerald-500`, `amber-500`).
- **Typography & Tabular Numerals**: Display titles set in bold modern sans (`Plus Jakarta Sans`); all financial figures and currency metrics set with `font-mono tabular-nums` to eliminate layout jitter.
- **Recharts Color Tokens**:
  - Target Goal: Crisp muted slate (`#334155` / `rgba(255, 255, 255, 0.1)`)
  - Draft Pipeline: Soft purple (`#A855F7`)
  - Submitted: Blue (`#3B82F6`)
  - Under Review: Amber (`#F59E0B`)
  - Approved / Secured: Emerald (`#10B981`)
- **Interactive Tooltips**: Recharts `Tooltip` styled with custom dark glass panels (`bg-[#0A0A18]/95 border border-white/15 backdrop-blur-md rounded-xl p-3 shadow-2xl`).

### C. Chatbot Attachment UX
- **Composer Toolbar**: A clean paperclip icon button positioned next to the microphone and send buttons.
- **Attachment Preview**: Floats directly above the input box when a file is selected:
  - Document icon (PDF) or image thumbnail preview.
  - File name truncated cleanly with file size.
  - Quick `X` button to discard prior to sending.
- **Message Rendering**: Attached files render as a preview card within user chat bubbles.
- **Multimodal Response**: Gemini analyzes the uploaded document or image alongside the prompt and returns structured markdown feedback (Executive Strengths, Missing Elements, Funding Match Score).

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Recharts Funnel vs Custom Multi-Stage Funnel
- **Chosen Approach**: Use Recharts `FunnelChart` with `Funnel` and `Tooltip`, paired with a responsive stage metrics breakdown row.
- **Why**: Recharts provides hardware-accelerated SVG rendering, responsive container sizing, and built-in animation. If data has 0 applications in a stage, it falls back to a clean empty funnel preview without crashing.
- **Alternatives Considered**: Hand-rolled CSS trapezoids (fragile on mobile viewports) or simple progress bars (doesn't convey the conversion drop-off concept).

### Decision 2: In-Memory / Firestore Goal Sync
- **Chosen Approach**: Derive default goal from Firestore `users/{userId}/funding_needs` items sum, with an optional custom goal stored in `users/{userId}` (`targetFundingGoal` field) and local state.
- **Why**: Keeps existing needs tracking synchronized with the dashboard visualization while giving founders freedom to project aspirational targets.

### Decision 3: Client-Side Multimodal Encoding for Gemini
- **Chosen Approach**: Convert images and PDFs directly to base64 via `FileReader` on the client, feeding them as `inlineData` parts to `@google/genai` inside `AIAssistant.tsx`.
- **Why**: Zero backend upload lag, works in offline-first mode, fully compatible with Google GenAI JS SDK, and does not require complex cloud bucket storage for ephemeral chat queries.

---

## 4. Technical Architecture & Data Strategy

### A. System & Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          DASHBOARD COMPONENT                           │
│                           (pages/Dashboard.tsx)                        │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
     ┌─────────────────────────────┐  ┌──────────────────────────────┐
     │   FundingAnalyticsSection   │  │    ApplicationFunnelChart    │
     │      (Recharts Bar/Area)    │  │       (Recharts Funnel)      │
     └──────────────┬──────────────┘  └──────────────┬───────────────┘
                    │                                │
                    ▼                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA COMPILATION ENGINE                         │
│  - Sums: Target Goal vs (Draft + Submitted + UnderReview + Approved)   │
│  - Stages: Counts & percentages per ApplicationStatus enum             │
│  - Source: Firestore `applications` + `funding_needs` collections      │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                        CHATBOT MULTIMODAL FLOW                         │
│                         (components/AIAssistant.tsx)                   │
├────────────────────────────────────────────────────────────────────────┤
│  User selects Image / PDF  ──> FileReader reads as Base64 Data URL     │
│  Composer displays attachment preview card with discard option         │
│  On Send ──> Dispatches Gemini API with multipart payload:             │
│              [ { text: userPrompt },                                   │
│                { inlineData: { mimeType: file.type, data: base64 } } ] │
│  Gemini 2.5/Flash parses document/visuals & streams funding critique   │
└────────────────────────────────────────────────────────────────────────┘
```

### B. Implementation Steps Breakdown

1. **Chart & Analytics Components**:
   - Create `components/FundingAnalyticsSection.tsx`: Houses the progress bar comparison (Total Goal vs Pipeline vs Approved), deficit calculation, metric pills, and in-place goal editor.
   - Create `components/ApplicationFunnelChart.tsx`: Houses the Recharts `FunnelChart` with stages: Draft $\rightarrow$ Submitted $\rightarrow$ Under Review $\rightarrow$ Approved, with conversion statistics.
   - Mount both into `pages/Dashboard.tsx` in a responsive 2-column grid.

2. **Multimodal Chatbot Enhancement**:
   - In `components/AIAssistant.tsx`, add hidden file `<input type="file" accept="image/*,application/pdf" />` and paperclip button.
   - Add state for `attachedFile: { file: File, base64: string, previewUrl: string, type: string } | null`.
   - Update `sendMessage` to support multipart contents (`inlineData` payload) when an attachment is present.
   - Enhance the system prompt to guide Gemini in providing funding readiness audits on uploaded pitch decks, executive summaries, financial tables, and CIPC certificates.

3. **Verification**:
   - Run `compile_applet` and `lint_applet` to verify compilation, bundle integrity, and type safety across all React 19 components.
