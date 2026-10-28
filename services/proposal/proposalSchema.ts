// services/proposal/proposalSchema.ts
/**
 * StacFund — Funding Proposal document schema
 * ============================================
 * The typed data model for the Canva-style funding-proposal builder.
 *
 * This is the single source of truth shared by:
 *   - services/proposal/proposalGenerator.ts  (AI outline + per-section fill)
 *   - services/proposal/proposalTemplates.ts  (premium design tokens)
 *   - components/proposal/ProposalPages.tsx    (the page renderers)
 *   - components/proposal/ProposalStudio.tsx   (the editor UX)
 *
 * Design goals:
 *   1. Flowing document, not slides. A proposal is long-form prose that
 *      reflows — the model is "sections with content blocks", rendered onto
 *      A4 pages that grow and slice at export time (utils/pdfExporter).
 *   2. Every field is user-editable. Nothing the AI writes is locked.
 *   3. Deterministic sections (compliance checklist) are built in code from
 *      the AutofillContext — NOT hallucinated by the AI. Funder-facing
 *      accuracy is the product's moat.
 */

// ─── Section kinds ───────────────────────────────────────────────────────────

/**
 * The section taxonomy. The outline stage picks from this menu; the editor
 * can also add free-form 'custom' sections.
 */
export type SectionKind =
  | 'executive_summary'
  | 'about_business'
  | 'problem'
  | 'market_analysis'
  | 'competitive_advantage'
  | 'operations'
  | 'team'
  | 'financial_plan'
  | 'funding_request'
  | 'impact'
  | 'risk'
  | 'compliance'
  | 'custom';

/** Human labels for the editor UI + prompts. */
export const SECTION_KIND_LABELS: Record<SectionKind, string> = {
  executive_summary: 'Executive Summary',
  about_business: 'About the Business',
  problem: 'The Problem / Opportunity',
  market_analysis: 'Market Analysis',
  competitive_advantage: 'Competitive Advantage',
  operations: 'Operations Plan',
  team: 'Team & Ownership',
  financial_plan: 'Financial Plan',
  funding_request: 'Funding Request & Use of Funds',
  impact: 'Impact & Job Creation',
  risk: 'Risks & Mitigation',
  compliance: 'Compliance & Document Checklist',
  custom: 'Custom Section',
};

/** One-line guidance per kind — used by the outline prompt. */
export const SECTION_KIND_BRIEFS: Record<SectionKind, string> = {
  executive_summary: 'The 60-second pitch: who you are, what you need, and why this funder should say yes.',
  about_business: 'Legal entity, registration details, location, history, and what the business does today.',
  problem: 'The market gap or customer pain the business addresses, with local evidence.',
  market_analysis: 'Target market size, customer segments, and South African industry context.',
  competitive_advantage: 'Why this business wins against alternatives — differentiators, IP, positioning.',
  operations: 'How the business runs day-to-day: suppliers, production, distribution, capacity.',
  team: 'Founder(s), key staff, relevant experience, and ownership structure (BEE / youth %).',
  financial_plan: 'Revenue projections, cost structure, break-even analysis, and key assumptions.',
  funding_request: 'The exact amount requested, itemised use of funds, and repayment / equity terms.',
  impact: 'Jobs created (total, youth, women), community impact, and alignment with the funder\u2019s mandate.',
  risk: 'Honest key risks with concrete mitigation plans.',
  compliance: 'Eligibility rules checklist and required documents status.',
  custom: 'A section tailored to this specific funder or programme.',
};

// ─── Content blocks ──────────────────────────────────────────────────────────

export interface ProposalStat {
  /** Short display value, e.g. "R1.2M" or "14". */
  value: string;
  /** What the number means, e.g. "Year-2 revenue". */
  label: string;
}

export interface ProposalTable {
  caption?: string;
  columns: string[];
  rows: string[][];
}

// ─── Section ─────────────────────────────────────────────────────────────────

export type SectionStatus = 'outline' | 'filled';

export interface ProposalSection {
  id: string;
  kind: SectionKind;
  /** Display title shown on the page. Editable. */
  title: string;
  /** What this section must argue — written by the outline stage. */
  brief: string;
  /** Key points the section must cover — written by the outline stage. */
  keyPoints: string[];
  /** Whether this section appears in the exported document. */
  include: boolean;
  status: SectionStatus;
  /** Long-form prose paragraphs. Empty until the fill stage runs. */
  paragraphs: string[];
  /** High-signal bullet points (rendered under the paragraphs). */
  bullets: string[];
  /** Headline numbers rendered as a stat row. */
  stats: ProposalStat[];
  /** Optional structured table (financials, use of funds, compliance). */
  table: ProposalTable | null;
  /** True for code-built deterministic sections (compliance) — excluded from AI fill. */
  deterministic?: boolean;
}

// ─── Document meta ───────────────────────────────────────────────────────────

export interface ProposalMeta {
  businessName: string;
  /** One-line positioning statement for the cover. */
  tagline: string;
  /** Funder / programme name the proposal is addressed to. */
  preparedFor: string;
  /** Owner / director preparing the proposal. */
  preparedBy: string;
  /** Formatted date label, e.g. "October 2026". */
  dateLabel: string;
  /** Formatted requested amount, e.g. "R500 000". */
  requestedAmountLabel: string;
  /** Contact line for the closing page. */
  contactLine: string;
}

// ─── Document ────────────────────────────────────────────────────────────────

export interface ProposalDocument {
  meta: ProposalMeta;
  sections: ProposalSection[];
  templateId: string;
  /** Optional accent color override (hex) replacing the template default. */
  accentOverride?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let sectionSeq = 0;

export function newSectionId(): string {
  sectionSeq += 1;
  return `psec_${Date.now().toString(36)}_${sectionSeq}`;
}

export function createBlankSection(kind: SectionKind = 'custom', title?: string): ProposalSection {
  return {
    id: newSectionId(),
    kind,
    title: title || SECTION_KIND_LABELS[kind],
    brief: SECTION_KIND_BRIEFS[kind],
    keyPoints: [],
    include: true,
    status: 'outline',
    paragraphs: [],
    bullets: [],
    stats: [],
    table: null,
  };
}

export function createProposalMeta(partial: Partial<ProposalMeta> = {}): ProposalMeta {
  const now = new Date();
  return {
    businessName: partial.businessName || 'Your Business',
    tagline: partial.tagline || 'Funding proposal',
    preparedFor: partial.preparedFor || 'The Review Committee',
    preparedBy: partial.preparedBy || '',
    dateLabel: partial.dateLabel || now.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }),
    requestedAmountLabel: partial.requestedAmountLabel || '',
    contactLine: partial.contactLine || '',
  };
}

/** The default section menu the outline stage chooses from. */
export const DEFAULT_SECTION_ORDER: SectionKind[] = [
  'executive_summary',
  'about_business',
  'problem',
  'market_analysis',
  'competitive_advantage',
  'operations',
  'team',
  'financial_plan',
  'funding_request',
  'impact',
  'risk',
  // 'compliance' is appended deterministically by the studio, not by the AI.
];

/** Sections included in the exported document, in order. */
export function activeSections(doc: ProposalDocument): ProposalSection[] {
  return doc.sections.filter((s) => s.include);
}

/** How many AI sections still need their fill stage run. */
export function outlinePendingCount(doc: ProposalDocument): number {
  return doc.sections.filter((s) => s.include && !s.deterministic && s.status === 'outline').length;
}
