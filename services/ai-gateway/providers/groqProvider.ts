// services/ai-gateway/providers/groqProvider.ts
/**
 * Groq Provider Adapter
 *
 * Groq exposes an OpenAI-compatible Chat Completions API. We use plain
 * `fetch` (no SDK dependency) to keep the bundle lean and the behaviour
 * identical to the OpenRouter adapter.
 *
 * Free tier (as of 2026): GroqCloud offers generous free access to Llama 3.x
 * models. Check console.groq.com for current limits.
 */
import type { ProviderConfig, ProviderId, GatewayRequest, GatewayResponse, GatewayStreamChunk } from '../types';
import type { ProviderAdapter, GenerateContext } from './base';
import { GatewayError, toGatewayError } from '../errors';

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

export class GroqProvider implements ProviderAdapter {
  readonly id: ProviderId = 'groq';
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    if (!process.env.GROQ_API_KEY) {
      throw new GatewayError({
        kind: 'auth_invalid',
        message: 'GROQ_API_KEY is not set on the server.',
        provider: 'groq',
        statusCode: 500,
      });
    }
  }

  private apiKey() {
    return process.env.GROQ_API_KEY!;
  }

  private toOpenAIMessages(req: GatewayRequest) {
    return req.messages.map((m) => {
      const out: { role: string; content: string | any[] } = {
        role: m.role,
        content: m.content,
      };
      if (m.image?.url) {
        // Groq doesn't currently support vision in our routing, but format it
        // correctly in case they add a vision-capable model to the allowlist.
        out.content = [
          { type: 'text', text: m.content || '' },
          { type: 'image_url', image_url: { url: m.image.url } },
        ];
      }
      return out;
    });
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

  async generate(req: GatewayRequest, ctx: GenerateContext): Promise<GatewayResponse> {
    const started = Date.now();
    const { body, model } = this.buildBody(req, false);
    try {
      const res = await fetch(`${GROQ_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey()}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs || 30_000),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw toGatewayError(
          new Error(`Groq ${res.status}: ${errText.slice(0, 500)}`),
          'groq'
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
        provider: 'groq',
        model,
        latencyMs: Date.now() - started,
        usage,
        finishReason: data.choices?.[0]?.finish_reason,
        requestId: ctx.requestId,
      };
    } catch (err) {
      throw toGatewayError(err, 'groq');
    }
  }

  async *generateStream(req: GatewayRequest, ctx: GenerateContext): AsyncIterable<GatewayStreamChunk> {
    const { body, model } = this.buildBody(req, true);
    let totalUsage: GatewayStreamChunk['usage'];
    try {
      const res = await fetch(`${GROQ_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey()}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs || 30_000),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text();
        throw toGatewayError(new Error(`Groq ${res.status}: ${errText.slice(0, 500)}`), 'groq');
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
              yield { delta, provider: 'groq', model, done: false, requestId: ctx.requestId };
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
      yield { delta: '', provider: 'groq', model, done: true, requestId: ctx.requestId, usage: totalUsage };
    } catch (err) {
      throw toGatewayError(err, 'groq');
    }
  }

  async ping(): Promise<void> {
    const res = await fetch(`${GROQ_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey()}`,
      },
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
      throw new Error(`Groq ping failed ${res.status}: ${errText.slice(0, 200)}`);
    }
  }
}
