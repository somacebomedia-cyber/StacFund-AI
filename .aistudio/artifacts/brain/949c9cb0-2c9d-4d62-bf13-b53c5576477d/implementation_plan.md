# Hybrid AI Proposal & Business Plan Generator

An intelligent proposal synthesis engine for StacFund that generates comprehensive South African funding proposals and pitch presentations instantly without requiring user API keys, while automatically upgrading with live Gemini AI when backend credentials are present.

> [!IMPORTANT]
> **User Confirmed Decisions from Phase 1:**
> - **Operational Mode**: Hybrid mode featuring instant, zero-key offline synthesis with seamless Gemini AI live upgrade.
> - **Proposal Depth**: Comprehensive proposal including Executive Summary, Financial Requirements, Use of Funds breakdown, and Milestones & Projections.
> - **UI Provenance Indicator**: Automatic fallback with a subtle generation source badge ("Smart Synthesis" vs "Gemini AI") ensuring complete transparency and zero dead-end errors.

---

### 1. Overview & Core Concept

Currently, when users attempt to generate a business plan or funding proposal in the application workflow, the system attempts a direct call to Gemini (`gemini-3.1-pro-preview`). If no API key is configured or the upstream request fails, the application halts with an alert (`Failed to generate business plan`), blocking the applicant.

The **Hybrid Proposal Generator** removes this bottleneck entirely:
- **Zero-Key Capability**: Can run 100% locally in the browser or on the server without any external API keys or third-party service dependencies.
- **South African Funder Context**: The offline generator contains domain-grounded synthesis heuristics customized for South African public and private funding bodies (SEFA, IDC, NEF, NYDA, DTIC, Technology Innovation Agency, Casidra, provincial development corporations).
- **Comprehensive Structure**: Accurately computes financial allocations, budget distributions matching the requested funding amount, compliance narrative, and operational roadmap milestones.
- **Graceful Gemini Integration**: Whenever server credentials (`process.env.GEMINI_API_KEY`) are available, it queries modern `gemini-3.8-flash` for customized prose. If unavailable or rate-limited, it automatically falls back without blocking the user.

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Initiate Generation in Application Workflow (Step 2)**:
   - User reviews their auto-filled business profile and funding purpose in Step 1.
   - User clicks **"Generate Business Plan & Pitch"**.
2. **Dual-Path Generation with Instant Feedback**:
   - The engine initiates the live AI call (`gemini-3.8-flash`) with a fast 6-second timeout.
   - If the API succeeds, the proposal renders with a subtle `Gemini AI` badge.
   - If the API key is absent, expired, or unavailable, the synthesis engine instantly constructs a comprehensive proposal and displays a `Smart Synthesis` badge.
3. **Interactive Visual Pitch & Proposal Preview**:
   - The Gamma-style visual pitch layout launches immediately with all sections populated:
     - Slide 1: Cover & Mission Statement
     - Slide 2: Problem & Market Opportunity in South Africa
     - Slide 3: Solution & Business Model
     - Slide 4: Detailed Financial Plan & Fund Allocation
     - Slide 5: Execution Milestones & Projected Growth
     - Slide 6: Compliance & Governance (CIPC, SARS Tax, B-BBEE)
   - User can edit fields directly, download the pitch deck/proposal as PDF, and advance seamlessly to Step 3 (Compliance Documents).

#### Visual Styling & Restraint
- **Dark Glassmorphism Architecture**: Deep violet/slate background (`#0A0A1A` to `#130F26`), 1px translucent borders (`border-white/10`), and crisp high-contrast typography.
- **Zero-Pill Metadata**: Provenance indicators displayed as unobtrusive inline text badges with subtle icons (`Sparkles` for Gemini, `Cpu` for Smart Synthesis) without garish nested pill sandwiches.
- **Tabular Figures**: All financial currency figures formatted in monospace tabular nums (`font-mono tabular-nums`).

---

### 3. Key Product Decisions & Trade-Offs

#### Decision 1: Heuristic Engine Architecture
- **Chosen Approach**: Client-side domain synthesis utility (`utils/proposalSynthesisEngine.ts`) capable of generating tailored JSON matching the exact schema expected by `GammaPitchLayout` and `BusinessPlanDocument`.
- **Why**: Zero latency, zero external API costs, works completely offline, and guarantees 100% uptime for applicants regardless of API quotas.
- **Alternatives Considered**: Rejecting requests without API keys (leads to user churn and broken demo experience).

#### Decision 2: Model Selection for Live AI
- **Chosen Approach**: Update the model identifier from deprecated `gemini-3.1-pro-preview` to standard `gemini-3.8-flash` via the server proxy with environment variable fallback (`GEMINI_API_KEY` or `GOOGLE_GENAI_API_KEY`).
- **Why**: `gemini-3.8-flash` provides fast JSON generation within standard quotas and conforms strictly to the AI Studio SDK guidelines.

#### Decision 3: Document Integration
- **Chosen Approach**: Ensure both `GammaPitchLayout` and `BusinessPlanDocument` consume the unified output schema, supporting one-click PDF export, slide editing, and auto-attachment to the application submission pack.

---

### 4. Technical Architecture & Data Strategy

```
┌──────────────────────────────────────────────────────────────┐
│                    ApplicationWorkflow                        │
│                 (Step 2: Proposal Generator)                 │
└──────────────┬───────────────────────────────┬───────────────┘
               │                               │
       [Try Live Gemini]             [Fallback / Zero-Key]
               │                               │
               ▼                               ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│  services/geminiClient.ts    │ │ utils/                      │
│   POST /api/gemini/          │ │ proposalSynthesisEngine.ts   │
│   (model: gemini-3.8-flash)  │ │ (Heuristic Domain Engine)   │
└──────────────┬───────────────┘ └─────────────┬───────────────┘
               │                               │
               └───────────────┬───────────────┘
                               │
                               ▼
               ┌───────────────────────────────┐
               │    Comprehensive Proposal     │
               │   - Executive Summary         │
               │   - Financial Allocations     │
               │   - Operational Milestones    │
               │   - Market & Risk Strategy    │
               └───────────────┬───────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│      GammaPitchLayout        │ │    BusinessPlanDocument     │
│   (Interactive Deck Preview) │ │   (Printable A4 / PDF)      │
└──────────────────────────────┘ └─────────────────────────────┘
```

#### Data Entities & Schema
The proposal output schema matches the comprehensive layout:
```ts
export interface GeneratedProposal {
  executiveSummary: string;
  marketAnalysis: {
    targetMarket: string;
    competitiveAdvantage: string;
    industrySector: string;
  };
  financialPlan: {
    fundingRequirement: string;
    useOfFunds: Array<{ category: string; amount: string; percentage: number }>;
    projectedRoiMonths: number;
  };
  milestones: Array<{ phase: string; title: string; timeframe: string; deliverable: string }>;
  riskAndMitigation: Array<{ risk: string; mitigation: string }>;
  conclusion: string;
  generationSource: 'gemini' | 'synthesis';
}
```
