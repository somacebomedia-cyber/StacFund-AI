// services/opportunitiesStore.ts
/**
 * Browser-side store for funding opportunities — the single source of truth
 * every screen reads through.
 *
 *   built-in MOCK_FUNDING list  +  admin-published Firestore records
 *     ->  merged (published replaces built-in with the same id)
 *     ->  status re-derived from the dates, so a stored "OPEN" can never
 *         outlive its closing date.
 *
 * Rules:
 *  - NEVER writes to Firestore from the browser (rules block it anyway).
 *  - Hides scraper-only records (scraped_at but no review_status) — only what
 *    an admin reviewed & published is public, plus older hand-made records.
 *  - Never throws: if Firestore is unreachable you get the built-in list.
 *  - One shared cache with a short TTL, so every screen sees the same list and
 *    a freshly published record appears without a reload (the admin screen
 *    also fires the `stacfund_opportunities_invalidated` event to refresh
 *    immediately).
 */

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { MOCK_FUNDING } from '../constants';
import type { FundingOpportunityDb } from '../types';
import { isPublicRecord, mergeOpportunities, withComputedStatus } from './opportunityStatus';

/** Window event fired by the admin screen after a publish/reject (see WhatsAppIngestion). */
export const OPPORTUNITIES_INVALIDATED_EVENT = 'stacfund_opportunities_invalidated';

const CACHE_MS = 60_000;
let cache: { at: number; data: FundingOpportunityDb[] } | null = null;
let inflight: Promise<FundingOpportunityDb[]> | null = null;

/** The built-in list only (instant, no network). Statuses are re-derived from the dates. */
export function builtInOpportunities(): FundingOpportunityDb[] {
  return MOCK_FUNDING.map((op) => withComputedStatus(op));
}

/**
 * Returns the merged opportunity list (built-in + published). Serves the cache
 * when it is fresh; re-fetches after the TTL, on `force`, or after an admin
 * publish invalidates it. Never throws.
 */
export async function loadOpportunities(force = false): Promise<FundingOpportunityDb[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.data);
  if (!force && inflight) return inflight;

  inflight = (async () => {
    let remote: FundingOpportunityDb[] = [];
    try {
      const snap = await getDocs(collection(db, 'funding_opportunities'));
      remote = snap.docs
        .map((docSnap) => ({ ...(docSnap.data() as FundingOpportunityDb), opportunity_id: (docSnap.data() as FundingOpportunityDb).opportunity_id || docSnap.id }))
        .filter(isPublicRecord);
    } catch (e) {
      // Offline / rules blocked / Firebase not configured — fall through to the built-in list.
      console.warn('[opportunitiesStore] Could not read published opportunities; using the built-in list only', e);
    }
    const data = mergeOpportunities(MOCK_FUNDING, remote);
    cache = { at: Date.now(), data };
    return data;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Returns the cached list synchronously, or null if it has not loaded yet. */
export function getCachedOpportunities(): FundingOpportunityDb[] | null {
  return cache ? cache.data : null;
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

/**
 * React hook over the shared store. Starts with the built-in list (instant),
 * swaps in the merged list once loaded, and refreshes when the admin screen
 * publishes or rejects a record.
 */
export function useOpportunities(): { opportunities: FundingOpportunityDb[]; loading: boolean } {
  const [state, setState] = useState<{ opportunities: FundingOpportunityDb[]; loading: boolean }>(() => ({
    opportunities: cache ? cache.data : builtInOpportunities(),
    loading: true,
  }));

  useEffect(() => {
    let cancelled = false;
    const refresh = (force: boolean) => {
      loadOpportunities(force).then((data) => {
        if (!cancelled) setState({ opportunities: data, loading: false });
      });
    };
    refresh(false);
    const onInvalidate = () => refresh(true);
    window.addEventListener(OPPORTUNITIES_INVALIDATED_EVENT, onInvalidate);
    return () => {
      cancelled = true;
      window.removeEventListener(OPPORTUNITIES_INVALIDATED_EVENT, onInvalidate);
    };
  }, []);

  return state;
}
