// services/opportunitiesStore.ts
/**
 * Browser-side store for published funding opportunities.
 *
 * Single source of truth for every page that needs to show funding data:
 * reads Firestore `funding_opportunities` (only records an admin has
 * reviewed & published), merges in the built-in `MOCK_FUNDING` list as a
 * fallback, and re-derives the status from the dates so a stored "OPEN"
 * can never outlive its closing date.
 *
 * Rules:
 *  - NEVER writes to Firestore from the browser (rules block it anyway).
 *  - Hides scraper-only records (those with `scraped_at` but no `review_status`).
 *  - Returns the same shape as `MOCK_FUNDING` so callers do not need to branch.
 */
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { MOCK_FUNDING } from '../constants';
import type { FundingOpportunityDb } from '../types';
import { withComputedStatus } from './opportunityStatus';

let cache: FundingOpportunityDb[] | null = null;
let inflight: Promise<FundingOpportunityDb[]> | null = null;

/**
 * Returns the merged opportunity list. Subsequent calls return the cached
 * array; pass `force: true` to re-fetch from Firestore (used after a manual
 * publish in the admin screen).
 */
export async function loadOpportunities(force = false): Promise<FundingOpportunityDb[]> {
  if (!force && cache) return cache;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    const remote: FundingOpportunityDb[] = [];
    try {
      const snap = await getDocs(collection(db, 'funding_opportunities'));
      snap.forEach((docSnap) => {
        const data = docSnap.data() as FundingOpportunityDb;
        // Show only what an admin has reviewed & published. Older hand-made
        // records (no review_status, no scraped_at) stay visible. The pre-patch
        // scraper-saved records (scraped_at + no review_status) are hidden.
        const reviewed =
          data.review_status === 'published' ||
          (!data.review_status && !data.scraped_at);
        if (!reviewed) return;
        remote.push({ ...data, opportunity_id: data.opportunity_id || docSnap.id });
      });
    } catch (e) {
      // Offline / rules blocked / Firebase not configured — fall through to built-in list.
      console.warn('[opportunitiesStore] Could not read published opportunities; using built-in list only', e);
    }

    // Built-in first, then override with anything published under the same id.
    const merged = new Map<string, FundingOpportunityDb>();
    MOCK_FUNDING.forEach((op) => merged.set(op.opportunity_id, op));
    remote.forEach((op) => merged.set(op.opportunity_id, op));

    const result = Array.from(merged.values()).map((op) => withComputedStatus(op));
    cache = result;
    inflight = null;
    return result;
  })();

  return inflight;
}

/** Returns the cached list synchronously, or null if it has not loaded yet. */
export function getCachedOpportunities(): FundingOpportunityDb[] | null {
  return cache;
}

/** Drop the cache so the next call re-fetches. Call after a publish/reject in the admin screen. */
export function invalidateOpportunities(): void {
  cache = null;
  inflight = null;
}

/** Convenience: find one by id, loading the list first if needed. */
export async function getOpportunityById(id: string): Promise<FundingOpportunityDb | null> {
  const all = await loadOpportunities();
  return all.find((o) => o.opportunity_id === id) ?? null;
}
