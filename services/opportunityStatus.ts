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

/**
 * Returns a human-friendly description of the closing date relative to today in SAST.
 */
export function describeClosing(closingDate: string | null | undefined, now: Date = new Date()): string {
  if (!closingDate) return 'Open';
  if (/rolling/i.test(closingDate)) return 'Open all year';
  if (!ISO_DATE.test(closingDate)) return closingDate;

  const todayStr = todayInSouthAfrica(now);
  if (closingDate === todayStr) {
    return 'closes today';
  }

  const todayMs = new Date(`${todayStr}T00:00:00Z`).getTime();
  const closingMs = new Date(`${closingDate}T00:00:00Z`).getTime();
  const diffDays = Math.round((closingMs - todayMs) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'closed';
  }
  if (diffDays === 0) {
    return 'closes today';
  }
  if (diffDays === 1) {
    return '1 day left';
  }
  return `${diffDays} days left`;
}

/**
 * Determines whether an opportunity record is visible to end users.
 */
export function isPublicRecord(record: { review_status?: string | null; scraped_at?: string | null }): boolean {
  return (
    record.review_status === 'published' ||
    (!record.review_status && !record.scraped_at)
  );
}

/**
 * Merges base opportunities with remote overrides by opportunity_id.
 */
export function mergeOpportunities(
  base: FundingOpportunityDb[],
  remote: FundingOpportunityDb[]
): FundingOpportunityDb[] {
  const map = new Map<string, FundingOpportunityDb>();
  base.forEach((op) => map.set(op.opportunity_id, op));
  remote.forEach((op) => map.set(op.opportunity_id, op));
  return Array.from(map.values());
}
