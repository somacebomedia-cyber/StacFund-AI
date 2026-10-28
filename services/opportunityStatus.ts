// services/opportunityStatus.ts
/**
 * Pure date/status helpers shared by the server (intake + publish) and the
 * browser (Funding Explorer). Keep this file free of Node-only and
 * browser-only imports so both sides can use it.
 */
import type { FundingOpportunityDb } from '../types';

export type OpportunityStatus = 'OPEN' | 'CLOSED' | 'UPCOMING';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date as YYYY-MM-DD in South Africa, wherever the code happens to run. */
export function todayInSouthAfrica(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * OPEN on the closing date itself, CLOSED the day after. A missing or
 * non-date value (e.g. "Rolling") never closes an opportunity.
 */
export function computeStatus(
  opening: string | null | undefined,
  closing: string | null | undefined,
  now: Date = new Date()
): OpportunityStatus {
  const today = todayInSouthAfrica(now);
  if (opening && ISO_DATE.test(opening) && opening > today) return 'UPCOMING';
  if (closing && ISO_DATE.test(closing) && closing < today) return 'CLOSED';
  return 'OPEN';
}

/**
 * Re-derives `status` from the dates so a stored "OPEN" can never outlive its
 * closing date. Records without real dates keep whatever status they have.
 */
export function withComputedStatus<T extends Pick<FundingOpportunityDb, 'status' | 'closing_date' | 'opening_date'>>(
  opp: T,
  now: Date = new Date()
): T {
  const hasDates = ISO_DATE.test(opp.closing_date ?? '') || ISO_DATE.test(opp.opening_date ?? '');
  if (!hasDates) return opp;
  return { ...opp, status: computeStatus(opp.opening_date, opp.closing_date, now) };
}

// ─── Assembling the public list (shared by the Explorer, the Dashboard and the browser hook) ───

/**
 * True for records an admin has reviewed and published, plus older hand-made
 * records. Records the scraper saved before the review queue existed (they have
 * `scraped_at` and no `review_status`) stay hidden.
 */
export function isPublicRecord(data: Pick<FundingOpportunityDb, 'review_status' | 'scraped_at'>): boolean {
  return data.review_status === 'published' || (!data.review_status && !data.scraped_at);
}

/**
 * Built-in list first; a published record with the same id replaces it. Every
 * status is re-derived from the dates, so a stored "OPEN" never outlives its
 * closing date.
 */
export function mergeOpportunities(
  builtIn: FundingOpportunityDb[],
  remote: FundingOpportunityDb[],
  now: Date = new Date()
): FundingOpportunityDb[] {
  const merged = new Map<string, FundingOpportunityDb>();
  builtIn.forEach((op) => merged.set(op.opportunity_id, op));
  remote.filter(isPublicRecord).forEach((op) => merged.set(op.opportunity_id, op));
  return Array.from(merged.values()).map((op) => withComputedStatus(op, now));
}

// ─── Plain-language closing date ─────────────────────────────────────────────

/** "5 November 2026 (11 days left)", "Open all year", or the stored text when it is not a real date. */
export function describeClosing(closing: string | null | undefined, now: Date = new Date()): string {
  const value = (closing ?? '').trim();
  if (!value) return 'Not stated';
  if (!ISO_DATE.test(value)) return /^rolling$/i.test(value) ? 'Open all year' : value;
  const today = todayInSouthAfrica(now);
  const days = Math.round((Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const pretty = new Date(`${value}T00:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (days < 0) return `${pretty} (closed)`;
  if (days === 0) return `${pretty} (closes today)`;
  return `${pretty} (${days} day${days === 1 ? '' : 's'} left)`;
}
