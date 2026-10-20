// services/ai-gateway/index.ts
/**
 * StacFund AI Gateway — Public Exports
 *
 * Single import surface for the rest of the codebase:
 *   import { gateway, initUsageTracker } from './services/ai-gateway';
 */
export { gateway } from './gateway';
export { initUsageTracker, checkUsage, recordUsage, getUsageSnapshot, estimateTokens, getAllInMemoryUsage } from './usageTracker';
export { initHealthCheck, getHealth, isAvailable, shouldTry, recordSuccess, recordFailure, getHealthSnapshot, getAllHealthSnapshots, probeProviders } from './healthCheck';
export { loadProviderConfigs, getEnabledProviderIds, getUserLimits, TASK_ROUTING, USER_LIMITS, isImageGenerationAllowed } from './config';
export { classifyTask } from './taskClassifier';
export { selectProviders } from './router';
export { GatewayError, toGatewayError } from './errors';
export type * from './types';
export type { ProviderAdapter, GenerateContext } from './providers/base';
