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
