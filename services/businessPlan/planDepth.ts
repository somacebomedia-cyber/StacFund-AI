// services/businessPlan/planDepth.ts
/**
 * StacFund — Business plan DEPTH ENGINE
 * =====================================
 * Turns "who is this going to, and for how much?" into a concrete,
 * deterministic length contract:
 *
 *      target pages ∈ [70 … 120]
 *
 * Rules (South African funding landscape):
 *   1. Base length scales with the amount requested — a R150k SEFA micro
 *      application and a R30m IDC industrial facility are different documents.
 *   2. Funder category adjusts the base: development finance institutions
 *      (IDC / DBSA / NEF large) and banks expect the deepest analysis;
 *      micro-finance and short-cycle grant committees expect leaner plans.
 *   3. Hard clamps: never below 70 pages, never above 120 pages.
 *
 * The engine also allocates the total WORD BUDGET across chapters, with
 * funder-specific emphasis (banks → financials; development funders → impact).
 */
import type { PlanDepthInfo } from './planSchema';

// ─── Funder classification ───────────────────────────────────────────────────

export type FunderCategory =
  | 'development_micro' // SEFA micro, municipal funds, small enterprise finance
  | 'development_dfi'   // IDC, DBSA, NEF, SEFA industrial/large facilities
  | 'bank'              // commercial bank lending (Absa, FNB, Nedbank, Standard)
  | 'grant'             // grants, competitions, accelerators, prizes
  | 'corporate'         // corporate sponsorships, enterprise & supplier dev (ESD)
  | 'generic';          // unknown / no funder selected

export interface FunderClassification {
  category: FunderCategory;
  /** Short human label for the UI, e.g. "Development finance institution". */
  label: string;
}

const DFI_PATTERNS = [
  'idc', 'industrial development', 'dbsa', 'development bank', 'nef', 'national empowerment',
  'sefa', 'small enterprise finance', 'isfap',
];
const MICRO_PATTERNS = ['micro', 'municipal', 'youth fund', 'nyda', 'cyc', 'co-operatives'];
const BANK_PATTERNS = ['bank', 'absa', 'fnb', 'first national', 'nedbank', 'standard bank', 'capitec', 'investec', 'tyme'];
const GRANT_PATTERNS = ['grant', 'competition', 'challenge', 'prize', 'award', 'accelerator', 'incubator', 'fund a startup', 'pitch'];
const CORPORATE_PATTERNS = ['pty', 'ltd', 'limited', 'esd', 'enterprise development', 'supplier development', 'sponsorship', 'foundation'];

/**
 * Classifies a funder from the issuer name + funding type of the opportunity.
 * Deliberately conservative: unknown names fall back to 'generic' (which
 * behaves like a balanced development-finance audience).
 */
export function classifyFunder(issuerName: string, fundingType?: string): FunderClassification {
  const hay = `${issuerName || ''} ${fundingType || ''}`.toLowerCase();

  const hit = (patterns: string[]) => patterns.some((p) => hay.includes(p));

  // Order matters: specific DFIs before generic "fund"-like words.
  if (hit(DFI_PATTERNS)) {
    // NYDA / municipal / micro funds are development finance but LEAN.
    if (hit(MICRO_PATTERNS)) return { category: 'development_micro', label: 'Micro & youth development finance' };
    return { category: 'development_dfi', label: 'Development finance institution' };
  }
  if (hit(MICRO_PATTERNS)) return { category: 'development_micro', label: 'Micro & youth development finance' };
  if (hit(BANK_PATTERNS)) return { category: 'bank', label: 'Commercial bank / credit provider' };
  if (hit(GRANT_PATTERNS)) return { category: 'grant', label: 'Grant / competition funder' };
  if (hit(CORPORATE_PATTERNS)) return { category: 'corporate', label: 'Corporate / ESD programme' };
  return { category: 'generic', label: 'General funder' };
}

// ─── Depth profile ───────────────────────────────────────────────────────────

/** Effective prose density of a content page in the institutional template. */
export const WORDS_PER_PAGE = 360;

/** Pages that exist no matter what: cover + TOC + chapter openers (+ closing). */
export function structuralPageCount(chapterCount: number): number {
  // 1 cover + TOC (≈2 at this size) + one opener per chapter.
  return 1 + 2 + chapterCount;
}

export type DepthOverride = 'auto' | 'concise' | 'standard' | 'comprehensive' | 'maximum';

export interface DepthInput {
  category: FunderCategory;
  /** Rand amount requested (0 / undefined when unknown). */
  amountRand?: number;
  override?: DepthOverride;
}

export interface DepthProfile extends PlanDepthInfo {
  category: FunderCategory;
  categoryLabel: string;
  /** Structural (non-content) pages implied by this depth. */
  structuralPages: number;
  /** 0…1 — how much of the expansion pool to activate. */
  expansionRatio: number;
}

/** Base content-pages from the amount band, before funder adjustment. */
function baseTargetPagesFromAmount(amountRand?: number): number {
  if (!amountRand || amountRand <= 0) return 84; // unknown → solid standard plan
  if (amountRand <= 250_000) return 68;          // micro
  if (amountRand <= 1_000_000) return 76;        // small
  if (amountRand <= 5_000_000) return 86;        // medium
  if (amountRand <= 20_000_000) return 96;       // large
  return 106;                                     // industrial-scale
}

/** Funder-category page modifier. */
function categoryModifier(category: FunderCategory): number {
  switch (category) {
    case 'development_dfi': return +8;  // DFI credit committees want depth
    case 'bank': return +6;             // banks: ratios, security, cash flow
    case 'corporate': return +2;
    case 'grant': return 0;
    case 'generic': return 0;
    case 'development_micro': return -6; // lean, fast-cycle committees
  }
}

function labelForPages(pages: number): string {
  if (pages < 78) return 'Lean';
  if (pages < 90) return 'Standard';
  if (pages < 104) return 'Comprehensive';
  return 'Maximum depth';
}

export const MIN_PAGES = 70;
export const MAX_PAGES = 120;

/**
 * THE depth contract. `chapterCount` is known before budgets are allocated
 * (the catalog is deterministic per depth), so structural pages are exact.
 */
export function computeDepth(input: DepthInput, chapterCount: number): DepthProfile {
  let target: number;

  switch (input.override) {
    case 'concise': target = MIN_PAGES + 2; break;        // ≈72
    case 'standard': target = 86; break;
    case 'comprehensive': target = 104; break;
    case 'maximum': target = MAX_PAGES; break;            // 120
    default:
      target = baseTargetPagesFromAmount(input.amountRand) + categoryModifier(input.category);
  }

  target = Math.max(MIN_PAGES, Math.min(MAX_PAGES, target));

  // The band: deepen until at least minPages; hard ceiling maxPages.
  const minPages = Math.max(MIN_PAGES, target - 8);
  const maxPages = MAX_PAGES;

  const structural = structuralPageCount(chapterCount);
  const targetWords = Math.max(9_000, Math.round((target - structural) * WORDS_PER_PAGE));

  // Expansion ratio: 0 at 70 pages → 1 at 120 pages.
  const expansionRatio = Math.max(0, Math.min(1, (target - MIN_PAGES) / (MAX_PAGES - MIN_PAGES)));

  return {
    targetPages: target,
    minPages,
    maxPages,
    targetWords,
    label: labelForPages(target),
    category: input.category,
    categoryLabel: '',
    structuralPages: structural,
    expansionRatio,
  };
}

// ─── Chapter word budgets ────────────────────────────────────────────────────

export interface ChapterBudget {
  chapterId: string;
  words: number;
}

/** Base weights per chapter id — Venturekit-class structure proportions. */
const BASE_WEIGHTS: Record<string, number> = {
  executive_summary: 0.032,
  company_overview: 0.055,
  swot_analysis: 0.035,
  business_models: 0.065,
  viability_analysis: 0.045,
  market_research: 0.135,
  products_services: 0.185,
  sales_marketing: 0.145,
  financial_plan: 0.115,
  operations: 0.06,
  risk_analysis: 0.04,
  regulatory_compliance: 0.035,
  implementation_plan: 0.05,
  impact_alignment: 0.053,
};

/** Funder-specific emphasis tweaks (added weight, then renormalised). */
const CATEGORY_EMPHASIS: Partial<Record<FunderCategory, Record<string, number>>> = {
  bank: { financial_plan: +0.05, risk_analysis: +0.015, sales_marketing: -0.02 },
  development_dfi: { financial_plan: +0.03, market_research: +0.02, impact_alignment: +0.015 },
  development_micro: { financial_plan: -0.015, impact_alignment: +0.02, company_overview: +0.01 },
  grant: { impact_alignment: +0.03, market_research: +0.01, financial_plan: -0.02 },
  corporate: { impact_alignment: +0.02, sales_marketing: +0.01 },
};

/**
 * Allocates the total word budget across the chapters present in the plan.
 * Returns a map chapterId → word budget (min 350 words so no chapter is a stub).
 */
export function allocateChapterBudgets(
  chapterIds: string[],
  targetWords: number,
  category: FunderCategory
): Record<string, number> {
  const emphasis = CATEGORY_EMPHASIS[category] || {};
  const weights = chapterIds.map((id) => Math.max(0.01, (BASE_WEIGHTS[id] ?? 0.05) + (emphasis[id] ?? 0)));
  const total = weights.reduce((a, b) => a + b, 0);

  const budgets: Record<string, number> = {};
  chapterIds.forEach((id, i) => {
    budgets[id] = Math.max(350, Math.round((weights[i] / total) * targetWords));
  });
  return budgets;
}

/** Splits a chapter budget across its subsections (evenly, clamped). */
export function splitBudgetAcrossSubsections(total: number, count: number): number[] {
  if (count <= 0) return [];
  const each = Math.round(total / count);
  return Array.from({ length: count }, () => Math.max(420, Math.min(1_500, each)));
}
