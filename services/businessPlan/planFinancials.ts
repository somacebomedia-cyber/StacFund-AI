// services/businessPlan/planFinancials.ts
/**
 * StacFund — REAL financial figures for the Financial Plan chapter
 * =================================================================
 * The user's Funding Needs Tracker (users/{uid}/funding_needs) already
 * holds costed, sourced funding requirements — item name, estimated cost,
 * reason, quotation links. This module turns that register into:
 *
 *   1. A DETERMINISTIC "Funding Requirement & Use of Funds" subsection
 *      (built in code, never AI): the itemised table, the total, the
 *      reconciliation against the amount requested, and stat chips.
 *   2. A context block injected into EVERY fill call, instructing the AI
 *      to use these exact Rand amounts in financial narratives instead of
 *      inventing placeholders.
 *   3. Key claims (consistency seeds) so 50+ later sections stay
 *      numerically consistent with the register.
 *
 * Mirrors the philosophy of buildDocumentChecklistSubsection(): numbers a
 * funder will verify are generated deterministically from real data.
 */
import { newId, type PlanBlock, type PlanSubsection } from './planSchema';

// ─── The funding-needs register shape (users/{uid}/funding_needs) ────────────

/**
 * Structural mirror of `FundingNeed` from components/FundingNeedsTracker.tsx.
 * Declared locally so services never import from components.
 */
export interface FundingNeedItem {
  id: string;
  itemName: string;
  estimatedCost: number;
  reason: string;
  status: 'pending' | 'applied' | 'received';
  appliedTo?: string;
  productLink?: string;
  quotationDocId?: string;
  quotationDocName?: string;
}

export interface FundingNeedsSummary {
  /** Active items (pending/applied, cost > 0) sorted by cost descending. */
  items: FundingNeedItem[];
  /** Sum of active item costs (Rand). */
  totalRand: number;
  /** Number of active items. */
  count: number;
  /** Items excluded because funding was already received. */
  receivedExcluded: number;
  /** totalRand / requestedRand × 100 (null when no amount requested). */
  coveragePct: number | null;
  /** requestedRand − totalRand. Positive = shortfall, negative = surplus. */
  gapRand: number;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/** R- formatting with space thousands separators, e.g. R1 234 567. */
export function formatRandAmount(n: number): string {
  if (!Number.isFinite(n)) return 'R0';
  const rounded = Math.round(n);
  // Node/browsers emit NBSP (U+00A0) or commas as the group separator for
  // en-ZA depending on ICU — normalise to single regular spaces so string
  // output is deterministic across runtimes.
  const grouped = rounded.toLocaleString('en-ZA').replace(/[\s,\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
  return `R${grouped}`;
}

/** Compact funder shorthand: R1.2m / R850k / R15 000. */
export function formatRandCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return 'R0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `R${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}m`;
  if (abs >= 100_000) return `R${Math.round(n / 1_000)}k`;
  return formatRandAmount(n);
}

/** Normalises locale separators in any pre-formatted Rand string (NBSP → space). */
export function normalizeRandSpacing(s: string): string {
  return String(s).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ');
}

// ─── Loading & summarising ───────────────────────────────────────────────────

/**
 * Reads the user's funding-needs register from Firestore.
 * Browser-side (uses the client SDK); safe to call from studio components.
 */
export async function loadFundingNeeds(userId: string): Promise<FundingNeedItem[]> {
  try {
    const { collection, getDocs } = await import('firebase/firestore');
    const { db } = await import('../firebase');
    const snap = await getDocs(collection(db, 'users', userId, 'funding_needs'));
    return snap.docs
      .map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          itemName: String(raw.itemName ?? raw.name ?? '').trim(),
          estimatedCost: Number(raw.estimatedCost ?? raw.cost ?? 0) || 0,
          reason: String(raw.reason ?? '').trim(),
          status: (['pending', 'applied', 'received'].includes(String(raw.status))
            ? String(raw.status)
            : 'pending') as FundingNeedItem['status'],
          appliedTo: raw.appliedTo ? String(raw.appliedTo) : undefined,
          productLink: raw.productLink ? String(raw.productLink) : undefined,
          quotationDocId: raw.quotationDocId ? String(raw.quotationDocId) : undefined,
          quotationDocName: raw.quotationDocName ? String(raw.quotationDocName) : undefined,
        } as FundingNeedItem;
      })
      .filter((n) => n.itemName.length > 0);
  } catch (e) {
    console.warn('[planFinancials] funding-needs load failed', e);
    return [];
  }
}

/**
 * Reduces the raw register to the summary that drives the Financial Plan.
 * Items already 'received' are excluded from the funding request (they are
 * funded); zero-cost rows are dropped as noise.
 */
export function summarizeFundingNeeds(
  needs: FundingNeedItem[],
  requestedRand: number
): FundingNeedsSummary {
  const active = needs
    .filter((n) => n.status !== 'received' && Number(n.estimatedCost) > 0)
    .sort((a, b) => b.estimatedCost - a.estimatedCost);
  const totalRand = active.reduce((sum, n) => sum + n.estimatedCost, 0);
  return {
    items: active,
    totalRand,
    count: active.length,
    receivedExcluded: needs.filter((n) => n.status === 'received').length,
    coveragePct: requestedRand > 0 ? Math.round((totalRand / requestedRand) * 100) : null,
    gapRand: requestedRand > 0 ? requestedRand - totalRand : 0,
  };
}

/** Lightweight shape the setup panel renders. */
export interface FundingNeedsPanelInfo {
  count: number;
  totalRand: number;
  requestedRand: number;
  coveragePct: number | null;
  gapRand: number;
  receivedExcluded: number;
  topItems: { name: string; cost: number }[];
}

export function toPanelInfo(s: FundingNeedsSummary, requestedRand: number): FundingNeedsPanelInfo {
  return {
    count: s.count,
    totalRand: s.totalRand,
    requestedRand,
    coveragePct: s.coveragePct,
    gapRand: s.gapRand,
    receivedExcluded: s.receivedExcluded,
    topItems: s.items.slice(0, 3).map((i) => ({ name: i.itemName, cost: i.estimatedCost })),
  };
}

// ─── 1. Deterministic Use-of-Funds subsection ────────────────────────────────

function itemNote(n: FundingNeedItem): string {
  const bits: string[] = [];
  if (n.reason) bits.push(n.reason.length > 90 ? `${n.reason.slice(0, 87)}…` : n.reason);
  if (n.quotationDocName) bits.push(`Quotation: ${n.quotationDocName}`);
  else if (n.productLink) bits.push('Supplier link on file');
  return bits.join(' — ') || '—';
}

/**
 * Builds the deterministic "Funding Requirement & Use of Funds" subsection
 * from the REAL funding-needs register. Returns null when the register is
 * empty (the AI-written fallback subsection is then kept).
 */
export function buildUseOfFundsSubsection(
  summary: FundingNeedsSummary,
  requestedAmountRand: number,
  requestedAmountLabel: string
): PlanSubsection | null {
  if (!summary.count) return null;

  const rows: string[][] = summary.items.map((n) => {
    const pct = summary.totalRand > 0 ? ((n.estimatedCost / summary.totalRand) * 100).toFixed(1) : '0.0';
    return [n.itemName, formatRandAmount(n.estimatedCost), `${pct}%`, itemNote(n)];
  });
  rows.push(['Total itemised', formatRandAmount(summary.totalRand), '100%', 'Sum of the register above']);

  // Reconciliation callout against the amount requested.
  let calloutText: string;
  const requested = requestedAmountRand > 0 ? requestedAmountRand : 0;
  if (!requested) {
    calloutText =
      `The itemised register above totals ${formatRandAmount(summary.totalRand)} across ${summary.count} costed requirement${summary.count > 1 ? 's' : ''}. ` +
      'No specific funding amount has been requested against this plan yet; the register total is the amount sought.';
  } else if (Math.abs(summary.gapRand) <= Math.max(500, requested * 0.005)) {
    calloutText =
      `The itemised register above totals ${formatRandAmount(summary.totalRand)}, matching the ${requestedAmountLabel || formatRandAmount(requested)} requested from the funder. ` +
      'Every Rand of the request is mapped to a costed, sourced requirement in the applicant\u2019s funding-needs register.';
  } else if (summary.gapRand > 0) {
    calloutText =
      `The itemised register above totals ${formatRandAmount(summary.totalRand)} against the ${requestedAmountLabel || formatRandAmount(requested)} requested — a shortfall of ${formatRandAmount(summary.gapRand)}. ` +
      `The balance is applied as unallocated contingency and first-month working capital, and should be motivated in the funding narrative.`;
  } else {
    calloutText =
      `The itemised register above totals ${formatRandAmount(summary.totalRand)} against the ${requestedAmountLabel || formatRandAmount(requested)} requested — a surplus of ${formatRandAmount(-summary.gapRand)}. ` +
      'The funder is asked to consider the full itemised register; items can be phased should the approved amount be lower.';
  }

  const leadParagraph =
    `This funding requirement is not an estimate. Every line below is drawn directly from the applicant\u2019s costed funding-needs register, ` +
    `captured item by item during application preparation${summary.receivedExcluded ? ` (${summary.receivedExcluded} item${summary.receivedExcluded > 1 ? 's' : ''} already funded elsewhere are excluded)` : ''}. ` +
    `The register totals ${formatRandAmount(summary.totalRand)} across ${summary.count} item${summary.count > 1 ? 's' : ''}; supplier quotations are on file where indicated.`;

  const stats: PlanBlock['stats'] = [
    { value: formatRandCompact(summary.totalRand), label: 'Itemised funding needs' },
    { value: String(summary.count), label: `Costed item${summary.count > 1 ? 's' : ''}` },
  ];
  if (requested > 0) {
    stats.push({ value: requestedAmountLabel || formatRandCompact(requested), label: 'Requested from funder' });
    if (summary.coveragePct !== null) stats.push({ value: `${summary.coveragePct}%`, label: 'Request itemised' });
  }

  const blocks: PlanBlock[] = [
    { id: newId('pb'), type: 'paragraph', text: leadParagraph },
    {
      id: newId('pb'),
      type: 'table',
      table: {
        caption: 'Use of funds — itemised from the applicant\u2019s funding-needs register',
        columns: ['Use of funds item', 'Amount (R)', '% of total', 'Basis / quotation'],
        rows,
      },
    },
    { id: newId('pb'), type: 'callout', text: calloutText },
    { id: newId('pb'), type: 'stats', stats: stats.filter((s): s is { value: string; label: string } => Boolean(s)) },
  ];

  return {
    id: newId('sub'),
    title: 'Funding Requirement & Use of Funds',
    brief: 'Deterministic use-of-funds table generated from the applicant\u2019s real, costed funding-needs register — never AI-estimated.',
    recipe: '',
    targetWords: 0,
    status: 'filled',
    blocks,
    deterministic: true,
    poolId: 'funding_plan',
  };
}

// ─── 2. Context block for AI fill calls ──────────────────────────────────────

/**
 * The authoritative-figures block injected into every fill prompt when a
 * funding-needs register exists. Financial narratives must use THESE amounts.
 */
export function fundingNeedsContextBlock(
  summary: FundingNeedsSummary,
  requestedAmountLabel: string
): string {
  const lines = summary.items.map(
    (n) => `- ${n.itemName}: ${formatRandAmount(n.estimatedCost)}${n.quotationDocName ? ' (quotation on file)' : ''}${n.reason ? ` — ${n.reason.slice(0, 100)}` : ''}`
  );
  return [
    'REAL FUNDING NEEDS — THE APPLICANT\u2019S COSTED REGISTER (authoritative figures):',
    ...lines,
    `- Itemised total: ${formatRandAmount(summary.totalRand)}`,
    requestedAmountLabel ? `- Funding requested from the funder: ${requestedAmountLabel}` : '',
    '',
    'RULES FOR THESE FIGURES: any use-of-funds amounts, capital-expenditure lines or itemised costs you mention must match the register above exactly — do not invent alternative Rand amounts for these items. Where you project beyond the register (monthly operating costs, revenue, growth), state the basis explicitly as an assumption. Keep the arithmetic internally consistent with the itemised total.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

// ─── 3. Key claims (consistency seeds) ───────────────────────────────────────

/**
 * Headline claims derived from the register, seeded into the key-claims
 * tracker so every later section stays numerically consistent.
 */
export function fundingClaimsFromSummary(
  summary: FundingNeedsSummary,
  requestedAmountLabel: string
): string[] {
  const claims: string[] = [
    `Itemised use of funds (from the funding-needs register): ${formatRandAmount(summary.totalRand)} across ${summary.count} costed item${summary.count > 1 ? 's' : ''}`,
  ];
  if (requestedAmountLabel) claims.push(`Funding requested: ${requestedAmountLabel}`);
  if (summary.coveragePct !== null) claims.push(`Share of the request that is itemised: ${summary.coveragePct}%`);
  return claims;
}
