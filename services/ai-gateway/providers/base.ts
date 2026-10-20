// services/ai-gateway/providers/base.ts
/**
 * StacFund AI Gateway — Provider Adapter Interface
 *
 * Every provider adapter implements this interface. The router doesn't know
 * or care how the adapter talks to its underlying API — it just calls
 * `generate()` (or `generateStream()` / `generateImage()` / `embed()`).
 */
import type {
  GatewayRequest,
  GatewayResponse,
  GatewayStreamChunk,
  ProviderId,
} from '../types';
import type { ProviderConfig } from '../types';

export interface GenerateContext {
  requestId: string;
  userId: string;
  plan: string;
  caller?: string;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly config: ProviderConfig;

  /**
   * Non-streaming text generation.
   * Implementations should:
   *   - translate GatewayRequest → their native API call
   *   - convert errors to GatewayError via toGatewayError()
   *   - return a normalised GatewayResponse
   */
  generate(req: GatewayRequest, ctx: GenerateContext): Promise<GatewayResponse>;

  /**
   * Streaming text generation. Calls `onChunk` for each delta.
   * Implementations should yield GatewayStreamChunk objects.
   */
  generateStream?(
    req: GatewayRequest,
    ctx: GenerateContext
  ): AsyncIterable<GatewayStreamChunk>;

  /**
   * Image generation (only providers with imageGeneration capability).
   * Returns an array of image URLs or data URLs.
   */
  generateImage?(prompt: string, opts?: {
    aspectRatio?: string;
    count?: number;
  }): Promise<{ images: { url: string; mimeType: string }[]; model: string }>;

  /**
   * Embeddings (only providers with embeddings capability).
   */
  embed?(texts: string[]): Promise<{ vectors: number[][]; model: string }>;

  /**
   * Cheap health probe — used by the health checker.
   * Should send the smallest possible request to verify the provider is up.
   */
  ping(): Promise<void>;
}
