// services/ai-gateway/providers/huggingFaceProvider.ts
/**
 * Hugging Face Provider Adapter (embeddings only, for now)
 *
 * Hugging Face's free Inference API can serve embedding models and many
 * text-classification models. For StacFund's current needs, we only use
 * it for embeddings (semantic search of funding opportunities, etc.).
 *
 * Free tier: HF's free inference is rate-limited and not every model is
 * available 24/7 — but for embedding occasional documents it's fine and
 * keeps us off the paid Gemini embedding quota.
 */
import type { ProviderConfig, ProviderId, GatewayRequest, GatewayResponse } from '../types';
import type { ProviderAdapter, GenerateContext } from './base';
import { GatewayError, toGatewayError } from '../errors';

const HF_API_BASE = 'https://api-inference.huggingface.co/models';

export class HuggingFaceProvider implements ProviderAdapter {
  readonly id: ProviderId = 'huggingface';
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    if (!process.env.HF_API_TOKEN) {
      throw new GatewayError({
        kind: 'auth_invalid',
        message: 'HF_API_TOKEN is not set on the server.',
        provider: 'huggingface',
        statusCode: 500,
      });
    }
  }

  private token() {
    return process.env.HF_API_TOKEN!;
  }

  // HuggingFace is embeddings-only in our routing — generate() throws clearly.
  async generate(_req: GatewayRequest, _ctx: GenerateContext): Promise<GatewayResponse> {
    throw new GatewayError({
      kind: 'no_provider',
      message: 'Hugging Face is configured for embeddings only. Use embed() instead.',
      provider: 'huggingface',
      statusCode: 400,
    });
  }

  async embed(texts: string[]) {
    const model = this.config.defaultModel;
    try {
      const res = await fetch(`${HF_API_BASE}/${model}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
        signal: AbortSignal.timeout(this.config.timeoutMs || 20_000),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw toGatewayError(
          new Error(`HuggingFace ${res.status}: ${errText.slice(0, 300)}`),
          'huggingface'
        );
      }
      const data = (await res.json()) as any;
      // HF returns either an array of vectors or {error: ...}
      if (data.error) {
        throw new Error(`HuggingFace inference error: ${data.error}`);
      }
      const vectors = Array.isArray(data) ? data : [data];
      return { vectors, model };
    } catch (err) {
      throw toGatewayError(err, 'huggingface');
    }
  }

  async ping(): Promise<void> {
    const res = await fetch(`${HF_API_BASE}/${this.config.defaultModel}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: ['hi'], options: { wait_for_model: false } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok && res.status !== 503) {
      // 503 = model loading, treat as healthy
      const errText = await res.text();
      throw new Error(`HF ping failed ${res.status}: ${errText.slice(0, 200)}`);
    }
  }
}
