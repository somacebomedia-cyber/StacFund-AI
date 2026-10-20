// services/ai-gateway/providers/openRouterProvider.ts
/**
 * OpenRouter Provider Adapter
 *
 * OpenRouter is a unified API for many models. Their free tier currently
 * offers 50+ models with a 50 req/day cap on the free plan. We treat it as
 * a tertiary text provider — useful for fallbacks and experimentation.
 *
 * OpenRouter is OpenAI-compatible. We use plain `fetch` — same shape as the
 * Groq adapter, just a different base URL and the `HTTP-Referer` / `X-Title`
 * headers they ask you to send so they can attribute traffic.
 */
import type { ProviderConfig, ProviderId, GatewayRequest, GatewayResponse, GatewayStreamChunk } from '../types';
import type { ProviderAdapter, GenerateContext } from './base';
import { GatewayError, toGatewayError } from '../errors';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

export class OpenRouterProvider implements ProviderAdapter {
  readonly id: ProviderId = 'openrouter';
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    if (!process.env.OPENROUTER_API_KEY) {
      throw new GatewayError({
        kind: 'auth_invalid',
        message: 'OPENROUTER_API_KEY is not set on the server.',
        provider: 'openrouter',
        statusCode: 500,
      });
    }
  }

  private apiKey() {
    return process.env.OPENROUTER_API_KEY!;
  }

  private toOpenAIMessages(req: GatewayRequest) {
    return req.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  private buildBody(req: GatewayRequest, stream: boolean) {
    const model = req.model || this.config.defaultModel;
    const body: Record<string, unknown> = {
      model,
      messages: this.toOpenAIMessages(req),
      stream,
    };
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
    if (req.structured) {
      body.response_format = { type: 'json_object' };
    }
    return { body, model };
  }

  private headers() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey()}`,
      'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://stacfund.ai',
      'X-Title': 'StacFund AI',
    };
  }

  async generate(req: GatewayRequest, ctx: GenerateContext): Promise<GatewayResponse> {
    const started = Date.now();
    const { body, model } = this.buildBody(req, false);
    try {
      const res = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs || 45_000),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw toGatewayError(
          new Error(`OpenRouter ${res.status}: ${errText.slice(0, 500)}`),
          'openrouter'
        );
      }
      const data = (await res.json()) as any;
      const text = data.choices?.[0]?.message?.content || '';
      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined;
      return {
        text,
        provider: 'openrouter',
        model,
        latencyMs: Date.now() - started,
        usage,
        finishReason: data.choices?.[0]?.finish_reason,
        requestId: ctx.requestId,
      };
    } catch (err) {
      throw toGatewayError(err, 'openrouter');
    }
  }

  async *generateStream(req: GatewayRequest, ctx: GenerateContext): AsyncIterable<GatewayStreamChunk> {
    const { body, model } = this.buildBody(req, true);
    let totalUsage: GatewayStreamChunk['usage'];
    try {
      const res = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: { ...this.headers(), Accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs || 45_000),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text();
        throw toGatewayError(new Error(`OpenRouter ${res.status}: ${errText.slice(0, 500)}`), 'openrouter');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const evt = JSON.parse(payload);
            const delta = evt.choices?.[0]?.delta?.content || '';
            if (delta) {
              yield { delta, provider: 'openrouter', model, done: false, requestId: ctx.requestId };
            }
            if (evt.usage) {
              totalUsage = {
                promptTokens: evt.usage.prompt_tokens,
                completionTokens: evt.usage.completion_tokens,
                totalTokens: evt.usage.total_tokens,
              };
            }
          } catch {
            // Skip malformed chunk
          }
        }
      }
      yield { delta: '', provider: 'openrouter', model, done: true, requestId: ctx.requestId, usage: totalUsage };
    } catch (err) {
      throw toGatewayError(err, 'openrouter');
    }
  }

  async ping(): Promise<void> {
    const res = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.config.defaultModel,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter ping failed ${res.status}: ${errText.slice(0, 200)}`);
    }
  }
}
