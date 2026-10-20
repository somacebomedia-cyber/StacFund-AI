// services/ai-gateway/router.ts
/**
 * StacFund AI Gateway — Router
 *
 * Given a GatewayRequest, produces an ORDERED list of provider candidates.
 * The gateway executes them in order, falling back on retryable errors.
 *
 * Selection logic:
 *   1. If req.provider is set and that provider is available + capable → use it first.
 *   2. Otherwise, look up TASK_ROUTING[task] and filter to providers that are:
 *        a. enabled
 *        b. healthy (or half-open)
 *        c. capability-matched (e.g. vision tasks require vision capability)
 *   3. If req.noFallback → only return the first candidate.
 *   4. Always preserve order: primary, then fallbacks by priority.
 */
import type { AiTask, GatewayRequest, ProviderId, ProviderConfig } from './types';
import { TASK_ROUTING } from './config';
import { shouldTry } from './healthCheck';
import { GatewayError } from './errors';

/** Capability required for each task. */
const TASK_CAPABILITY: Partial<Record<AiTask, (c: ProviderConfig) => boolean>> = {
  image_generation: (c) => c.capabilities.imageGeneration,
  image_understanding: (c) => c.capabilities.vision,
  embedding: (c) => c.capabilities.embeddings,
  document_extraction: (c) => c.capabilities.structuredOutput,
  business_plan: (c) => c.capabilities.text,
  pitch_deck: (c) => c.capabilities.text,
  funding_analysis: (c) => c.capabilities.text,
  reasoning: (c) => c.capabilities.text,
  summarization: (c) => c.capabilities.text,
  classification: (c) => c.capabilities.text,
  chat: (c) => c.capabilities.text,
  default: (c) => c.capabilities.text,
};

export function selectProviders(
  req: GatewayRequest,
  task: AiTask,
  configs: Record<ProviderId, ProviderConfig>
): ProviderId[] {
  const capCheck = TASK_CAPABILITY[task] || ((c: ProviderConfig) => c.capabilities.text);

  // Filter to enabled, healthy, capable providers.
  const eligible = (Object.values(configs) as ProviderConfig[]).filter(
    (c) => c.enabled && capCheck(c) && shouldTry(c.id)
  );

  if (eligible.length === 0) {
    throw new GatewayError({
      kind: 'no_provider',
      message: `No eligible provider available for task "${task}".`,
      statusCode: 503,
    });
  }

  // Build the ordered candidate list.
  let ordered: ProviderId[];

  if (req.provider) {
    // Caller pinned a provider — it goes first, then the task-routing chain as fallback.
    const pinned = eligible.find((c) => c.id === req.provider);
    if (!pinned) {
      throw new GatewayError({
        kind: 'no_provider',
        message: `Pinned provider "${req.provider}" is not available for task "${task}".`,
        provider: req.provider,
        statusCode: 503,
      });
    }
    ordered = [req.provider, ...TASK_ROUTING[task].filter((id) => id !== req.provider && eligible.some((c) => c.id === id))];
  } else {
    // Use the task-routing chain, filtered to eligible providers.
    const routingChain = TASK_ROUTING[task] || TASK_ROUTING.default;
    ordered = routingChain.filter((id) => eligible.some((c) => c.id === id));
    // If nothing from the chain matched (shouldn't happen, but just in case),
    // fall back to all eligible providers by priority.
    if (ordered.length === 0) {
      ordered = eligible.sort((a, b) => a.priority - b.priority).map((c) => c.id);
    }
  }

  if (req.noFallback) {
    return ordered.slice(0, 1);
  }
  return ordered;
}
