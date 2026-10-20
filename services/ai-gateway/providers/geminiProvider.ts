// services/ai-gateway/providers/geminiProvider.ts
/**
 * Gemini Provider Adapter
 *
 * Wraps the existing @google/genai SDK. Talks DIRECTLY to Google's API
 * (server-side only) — it does NOT go through the legacy /api/gemini proxy,
 * so we don't have to keep that proxy in sync with the gateway.
 *
 * Why direct:
 *   - The legacy proxy was designed for the client SDK. The gateway is
 *     server-side, so it can use the SDK's native apiKey auth directly.
 *   - This avoids one hop and one source of failure.
 *
 * The legacy /api/gemini proxy is kept mounted for backward compatibility
 * with any code that still uses the client-side GoogleGenAI directly
 * (e.g. components that haven't been migrated yet), but new gateway
 * traffic uses this adapter.
 */
import { GoogleGenAI } from '@google/genai';
import type { ProviderConfig, ProviderId, GatewayRequest, GatewayResponse, GatewayStreamChunk } from '../types';
import type { ProviderAdapter, GenerateContext } from './base';
import { GatewayError, toGatewayError } from '../errors';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

export class GeminiProvider implements ProviderAdapter {
  readonly id: ProviderId = 'gemini';
  readonly config: ProviderConfig;
  private client: GoogleGenAI;

  constructor(config: ProviderConfig) {
    this.config = config;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new GatewayError({
        kind: 'auth_invalid',
        message: 'GEMINI_API_KEY is not set on the server.',
        provider: 'gemini',
        statusCode: 500,
      });
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  private toGeminiContents(req: GatewayRequest) {
    return req.messages.map((m) => {
      const parts: any[] = [{ text: m.content || ' ' }];
      if (m.image?.url) {
        parts.push({
          inlineData: {
            mimeType: m.image.mimeType || 'image/png',
            data: m.image.url.startsWith('data:')
              ? m.image.url.split(',')[1] || ''
              : m.image.url,
          },
        });
      }
      return {
        role: m.role === 'assistant' ? 'model' : m.role === 'tool' ? 'function' : 'user',
        parts,
      };
    });
  }

  async generate(req: GatewayRequest, ctx: GenerateContext): Promise<GatewayResponse> {
    const model = req.model || this.config.defaultModel;
    const started = Date.now();
    try {
      const config: any = {};
      if (req.temperature !== undefined) config.temperature = req.temperature;
      if (req.maxTokens !== undefined) config.maxOutputTokens = req.maxTokens;
      if (req.structured) {
        config.responseMimeType = 'application/json';
        if (req.structured.strict) {
          config.responseSchema = req.structured.schema;
        }
      }
      // System instruction: take any system message and pass it separately.
      const sysMsg = req.messages.find((m) => m.role === 'system');
      if (sysMsg) {
        config.systemInstruction = sysMsg.content;
      }
      const nonSys = req.messages.filter((m) => m.role !== 'system');

      const res = await this.client.models.generateContent({
        model,
        contents: this.toGeminiContents({ ...req, messages: nonSys }),
        config,
      });

      const text = res.text || '';
      const usage = res.usageMetadata
        ? {
            promptTokens: res.usageMetadata.promptTokenCount ?? undefined,
            completionTokens: res.usageMetadata.candidatesTokenCount ?? undefined,
            totalTokens: res.usageMetadata.totalTokenCount ?? undefined,
          }
        : undefined;

      return {
        text,
        provider: 'gemini',
        model,
        latencyMs: Date.now() - started,
        usage,
        finishReason: res.candidates?.[0]?.finishReason,
        requestId: ctx.requestId,
      };
    } catch (err) {
      throw toGatewayError(err, 'gemini');
    }
  }

  async *generateStream(req: GatewayRequest, ctx: GenerateContext): AsyncIterable<GatewayStreamChunk> {
    const model = req.model || this.config.defaultModel;
    try {
      const config: any = {};
      if (req.temperature !== undefined) config.temperature = req.temperature;
      if (req.maxTokens !== undefined) config.maxOutputTokens = req.maxTokens;
      const sysMsg = req.messages.find((m) => m.role === 'system');
      if (sysMsg) config.systemInstruction = sysMsg.content;
      const nonSys = req.messages.filter((m) => m.role !== 'system');

      const stream = await this.client.models.generateContentStream({
        model,
        contents: this.toGeminiContents({ ...req, messages: nonSys }),
        config,
      });

      let totalUsage: GatewayStreamChunk['usage'];
      for await (const evt of stream) {
        const delta = evt.text || '';
        if (delta) {
          yield { delta, provider: 'gemini', model, done: false, requestId: ctx.requestId };
        }
        if (evt.usageMetadata) {
          totalUsage = {
            promptTokens: evt.usageMetadata.promptTokenCount ?? undefined,
            completionTokens: evt.usageMetadata.candidatesTokenCount ?? undefined,
            totalTokens: evt.usageMetadata.totalTokenCount ?? undefined,
          };
        }
      }
      yield { delta: '', provider: 'gemini', model, done: true, requestId: ctx.requestId, usage: totalUsage };
    } catch (err) {
      throw toGatewayError(err, 'gemini');
    }
  }

  async generateImage(prompt: string, opts?: { aspectRatio?: string; count?: number }) {
    if (!this.config.capabilities.imageGeneration) {
      throw new GatewayError({
        kind: 'no_provider',
        message: 'Image generation is disabled. Set STACFUND_ENABLE_PAID_AI=true or add the model to STACFUND_AI_PAID_ALLOWLIST.',
        provider: 'gemini',
        statusCode: 403,
      });
    }
    const model = 'imagen-3.0-generate-001';
    try {
      const res = await this.client.models.generateImages({
        model,
        prompt,
        config: {
          numberOfImages: opts?.count || 1,
          aspectRatio: opts?.aspectRatio || '1:1',
        },
      });
      const images = (res.generatedImages || []).map((g) => ({
        url: `data:image/png;base64,${g.image?.imageBytes || ''}`,
        mimeType: 'image/png',
      }));
      return { images, model };
    } catch (err) {
      throw toGatewayError(err, 'gemini');
    }
  }

  async embed(texts: string[]) {
    const model = 'text-embedding-004';
    try {
      const res = await this.client.models.embedContent({
        model,
        contents: texts.map((t) => ({ role: 'user', parts: [{ text: t }] })),
      });
      const vectors = (res.embeddings || []).map((e: any) => e.values || []);
      return { vectors, model };
    } catch (err) {
      throw toGatewayError(err, 'gemini');
    }
  }

  async ping(): Promise<void> {
    try {
      const res = await this.client.models.generateContent({
        model: this.config.defaultModel,
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        config: { maxOutputTokens: 1 },
      });
      if (!res) throw new Error('Empty response from Gemini ping.');
    } catch (err) {
      throw toGatewayError(err, 'gemini');
    }
  }
}
