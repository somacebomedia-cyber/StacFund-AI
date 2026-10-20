// services/ai-gateway/usageTracker.ts
/**
 * StacFund AI Gateway — Usage Tracker
 *
 * Tracks per-user, per-provider AI usage over a rolling 24h window.
 * Two storage tiers:
 *
 *   1. In-memory Map (fast, always available)
 *   2. Firestore collection `ai_usage` (durable across restarts, queryable)
 *
 * Writes go to both. Reads prefer in-memory (fast), and fall back to Firestore
 * if the user hasn't been seen recently (e.g. after a server restart).
 *
 * Limits come from `getUserLimits()` and are enforced by the gateway router
 * BEFORE the request is dispatched to any provider — so a user over their
 * limit never consumes a provider's quota.
 */
import type { ProviderId } from './types';
import type { Firestore } from 'firebase-admin/firestore';
import { getUserLimits } from './config';

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24h rolling

interface UsageBucket {
  userId: string;
  plan: string;
  windowStart: number; // epoch ms
  requests: number;
  tokens: number;
  byProvider: Partial<Record<ProviderId, { requests: number; tokens: number }>>;
}

/** Rough token estimate: 4 chars ≈ 1 token. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Current rolling window start. */
function currentWindowStart(): number {
  return Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
}

/** In-memory cache keyed by userId. */
const memory = new Map<string, UsageBucket>();

let firestore: Firestore | null = null;
const COLLECTION = 'ai_usage';

export function initUsageTracker(db: Firestore | null) {
  firestore = db;
  if (db) {
    console.log('[Gateway] Usage tracker initialised with Firestore persistence.');
  } else {
    console.warn('[Gateway] Usage tracker running in-memory only (Firestore unavailable).');
  }
}

function emptyBucket(userId: string, plan: string): UsageBucket {
  return {
    userId,
    plan,
    windowStart: currentWindowStart(),
    requests: 0,
    tokens: 0,
    byProvider: {},
  };
}

async function loadFromFirestore(userId: string): Promise<UsageBucket | null> {
  if (!firestore) return null;
  try {
    const doc = await firestore.collection(COLLECTION).doc(userId).get();
    if (!doc.exists) return null;
    const data = doc.data() as Partial<UsageBucket> & { windowStart?: any };
    if (!data || !data.windowStart) return null;
    const ws = typeof data.windowStart === 'number' ? data.windowStart : data.windowStart.toMillis?.() ?? 0;
    // If the stored window is stale, treat as missing.
    if (ws !== currentWindowStart()) return null;
    return {
      userId,
      plan: data.plan || 'free',
      windowStart: ws,
      requests: data.requests || 0,
      tokens: data.tokens || 0,
      byProvider: data.byProvider || {},
    };
  } catch (e) {
    console.warn('[Gateway] Failed to load usage from Firestore:', (e as Error).message);
    return null;
  }
}

async function saveToFirestore(bucket: UsageBucket): Promise<void> {
  if (!firestore) return;
  try {
    await firestore
      .collection(COLLECTION)
      .doc(bucket.userId)
      .set(
        {
          ...bucket,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
  } catch (e) {
    console.warn('[Gateway] Failed to persist usage to Firestore:', (e as Error).message);
  }
}

/** Get the current usage bucket for a user, hydrating from Firestore if needed. */
async function getBucket(userId: string, plan: string): Promise<UsageBucket> {
  const ws = currentWindowStart();
  let bucket = memory.get(userId);
  if (!bucket || bucket.windowStart !== ws) {
    // Try Firestore first
    const hydrated = await loadFromFirestore(userId);
    if (hydrated && hydrated.windowStart === ws) {
      bucket = hydrated;
    } else {
      bucket = emptyBucket(userId, plan);
    }
    memory.set(userId, bucket);
  }
  // Always refresh plan in case it changed
  bucket.plan = plan;
  return bucket;
}

/**
 * Check whether a user may make another request.
 * Returns { allowed, reason, snapshot }.
 */
export async function checkUsage(
  userId: string,
  plan: string
): Promise<{ allowed: boolean; reason?: string; requests: number; tokens: number; requestLimit: number; tokenLimit: number }> {
  const limits = getUserLimits(plan);
  const bucket = await getBucket(userId, plan);

  if (bucket.requests >= limits.requests) {
    return {
      allowed: false,
      reason: `Daily request limit reached (${limits.requests}/day for ${plan} plan).`,
      requests: bucket.requests,
      tokens: bucket.tokens,
      requestLimit: limits.requests,
      tokenLimit: limits.tokens,
    };
  }
  if (bucket.tokens >= limits.tokens) {
    return {
      allowed: false,
      reason: `Daily token limit reached (${limits.tokens.toLocaleString()} tokens/day for ${plan} plan).`,
      requests: bucket.requests,
      tokens: bucket.tokens,
      requestLimit: limits.requests,
      tokenLimit: limits.tokens,
    };
  }
  return {
    allowed: true,
    requests: bucket.requests,
    tokens: bucket.tokens,
    requestLimit: limits.requests,
    tokenLimit: limits.tokens,
  };
}

/**
 * Record a completed request. Called AFTER a provider responds successfully
 * (or after a fallback). Failed-and-fallen-back requests still count the
 * successful provider's usage, not every attempt.
 */
export async function recordUsage(
  userId: string,
  plan: string,
  provider: ProviderId,
  tokensUsed: number
): Promise<void> {
  const bucket = await getBucket(userId, plan);
  bucket.requests += 1;
  bucket.tokens += tokensUsed;
  const p = (bucket.byProvider[provider] = bucket.byProvider[provider] || {
    requests: 0,
    tokens: 0,
  });
  p.requests += 1;
  p.tokens += tokensUsed;
  // Best-effort persist; don't block on it
  void saveToFirestore(bucket);
}

/** Get a snapshot of a user's current usage (for admin UI + client display). */
export async function getUsageSnapshot(userId: string, plan: string) {
  const limits = getUserLimits(plan);
  const bucket = await getBucket(userId, plan);
  return {
    userId,
    plan: bucket.plan,
    windowStart: new Date(bucket.windowStart).toISOString(),
    requests: bucket.requests,
    tokensUsed: bucket.tokens,
    requestLimit: limits.requests,
    tokenLimit: limits.tokens,
    byProvider: bucket.byProvider,
  };
}

/** Admin: aggregate usage across all users (memory only — cheap). */
export function getAllInMemoryUsage(): UsageBucket[] {
  return Array.from(memory.values());
}
