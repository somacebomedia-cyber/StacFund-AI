// services/ai-gateway/healthCheck.ts
/**
 * StacFund AI Gateway — Provider Health Checks & Circuit Breaker
 *
 * Maintains per-provider health state. When a provider fails repeatedly,
 * the circuit "opens" and the router skips that provider for a cooldown
 * period, allowing fallback providers to take over.
 *
 * States:
 *   - healthy       → 0 consecutive failures
 *   - degraded      → 1–2 consecutive failures (still tried, but warned)
 *   - unhealthy     → 3+ consecutive failures OR explicitly circuit-open
 *                    → skipped for COOLDOWN_MS, then half-open probe
 *   - disabled      → provider config disabled it (env var / missing key)
 *
 * All state is in-memory — this is a single-instance server. If you scale
 * horizontally, replace this with a shared store (Redis / Firestore).
 */
import type { ProviderId, ProviderHealth, ProviderHealthSnapshot } from './types';
import type { ProviderConfig } from './types';

interface ProviderState {
  consecutiveFailures: number;
  lastError?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  circuitOpenUntil?: number; // epoch ms; while in the future, provider is skipped
}

const state = new Map<ProviderId, ProviderState>();
let configsRef: Record<ProviderId, ProviderConfig> | null = null;

const FAILURE_THRESHOLD = 3; // open circuit after 3 consecutive failures
const COOLDOWN_MS = 60_000; // 1 minute cooldown once open
const HALF_OPEN_PROBES = 1; // let 1 probe through per cooldown to test recovery

export function initHealthCheck(configs: Record<ProviderId, ProviderConfig>) {
  configsRef = configs;
  (Object.keys(configs) as ProviderId[]).forEach((id) => {
    if (!state.has(id)) state.set(id, { consecutiveFailures: 0 });
  });
}

function getState(id: ProviderId): ProviderState {
  let s = state.get(id);
  if (!s) {
    s = { consecutiveFailures: 0 };
    state.set(id, s);
  }
  return s;
}

/** Compute current health for a provider. */
export function getHealth(id: ProviderId): ProviderHealth {
  if (!configsRef) return 'disabled';
  const cfg = configsRef[id];
  if (!cfg || !cfg.enabled) return 'disabled';
  const s = getState(id);
  const now = Date.now();
  if (s.circuitOpenUntil && s.circuitOpenUntil > now) return 'unhealthy';
  if (s.consecutiveFailures >= FAILURE_THRESHOLD) return 'unhealthy';
  if (s.consecutiveFailures > 0) return 'degraded';
  return 'healthy';
}

/** Is this provider currently allowed to receive a request? */
export function isAvailable(id: ProviderId): boolean {
  const h = getHealth(id);
  return h === 'healthy' || h === 'degraded';
}

/**
 * Try to acquire a "probe slot" for a half-open circuit.
 * Returns true if this caller is allowed to test the provider.
 */
function tryAcquireProbe(id: ProviderId): boolean {
  const s = getState(id);
  if (!s.circuitOpenUntil) return true;
  if (Date.now() >= s.circuitOpenUntil) {
    // Cooldown elapsed → half-open. Allow ONE probe.
    // We don't actually enforce "one" strictly here — the first successful
    // probe will close the circuit, subsequent failures will reopen it.
    return true;
  }
  return false;
}

/** Should the router consider this provider right now? */
export function shouldTry(id: ProviderId): boolean {
  if (!isAvailable(id)) {
    return tryAcquireProbe(id);
  }
  return true;
}

/** Record a successful call. Resets the failure counter and closes the circuit. */
export function recordSuccess(id: ProviderId) {
  const s = getState(id);
  s.consecutiveFailures = 0;
  s.lastSuccessAt = new Date().toISOString();
  s.circuitOpenUntil = undefined;
  s.lastError = undefined;
}

/** Record a failed call. May open the circuit if threshold is reached. */
export function recordFailure(id: ProviderId, error: string) {
  const s = getState(id);
  s.consecutiveFailures += 1;
  s.lastError = error;
  s.lastFailureAt = new Date().toISOString();
  if (s.consecutiveFailures >= FAILURE_THRESHOLD) {
    s.circuitOpenUntil = Date.now() + COOLDOWN_MS;
    console.warn(
      `[Gateway] Circuit OPEN for provider "${id}" after ${s.consecutiveFailures} consecutive failures. Cooldown ${COOLDOWN_MS}ms.`
    );
  }
}

/** Snapshot for admin UI / /api/ai/gateway/health. */
export function getHealthSnapshot(id: ProviderId): ProviderHealthSnapshot | null {
  if (!configsRef) return null;
  const cfg = configsRef[id];
  if (!cfg) return null;
  const s = getState(id);
  return {
    id,
    label: cfg.label,
    enabled: cfg.enabled,
    health: getHealth(id),
    consecutiveFailures: s.consecutiveFailures,
    lastError: s.lastError,
    lastSuccessAt: s.lastSuccessAt,
    lastFailureAt: s.lastFailureAt,
    defaultModel: cfg.defaultModel,
    availableModels: cfg.availableModels,
    paid: cfg.paid,
  };
}

/** All providers' health snapshots. */
export function getAllHealthSnapshots(): ProviderHealthSnapshot[] {
  if (!configsRef) return [];
  return (Object.keys(configsRef) as ProviderId[])
    .map((id) => getHealthSnapshot(id))
    .filter((s): s is ProviderHealthSnapshot => s !== null);
}

/**
 * Lightweight async ping — used by /api/ai/gateway/health?probe=true
 * Sends a trivial request to each enabled provider and records success/failure.
 * Returns the new health state per provider.
 *
 * This is intentionally cheap: 1-token "hi" prompt with maxTokens=1.
 */
export async function probeProviders(
  adapters: { id: ProviderId; ping: () => Promise<void> }[]
): Promise<ProviderHealthSnapshot[]> {
  const results = await Promise.allSettled(adapters.map((a) => a.ping()));
  results.forEach((r, i) => {
    const id = adapters[i].id;
    if (r.status === 'fulfilled') {
      recordSuccess(id);
    } else {
      recordFailure(id, (r.reason as Error)?.message || String(r.reason));
    }
  });
  return getAllHealthSnapshots();
}
