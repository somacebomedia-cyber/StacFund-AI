// services/ai-gateway-types.ts
/**
 * Client-side mirror of the gateway types.
 *
 * The server's canonical types live in services/ai-gateway/types.ts.
 * We keep a separate file for the client (rather than re-exporting) so the
 * client bundle never pulls in any server-only imports (e.g. firebase-admin
 * types) that might leak into the browser build.
 *
 * Keep this file in sync with services/ai-gateway/types.ts.
 */
export type AiTask =
  | 'chat'
  | 'business_plan'
  | 'pitch_deck'
  | 'funding_analysis'
  | 'document_extraction'
  | 'summarization'
  | 'classification'
  | 'image_generation'
  | 'image_understanding'
  | 'embedding'
  | 'reasoning'
  | 'default';

export interface ProviderCapabilities {
  text: boolean;
  vision: boolean;
  imageGeneration: boolean;
  structuredOutput: boolean;
  toolCalling: boolean;
  streaming: boolean;
  embeddings: boolean;
}

export type ProviderId = 'gemini' | 'groq' | 'openrouter' | 'huggingface';

export type ProviderHealth = 'healthy' | 'degraded' | 'unhealthy' | 'disabled';

export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  image?: {
    url: string;
    mimeType?: string;
  };
}

export interface GatewayRequest {
  task: AiTask;
  messages: GatewayMessage[];
  model?: string;
  provider?: ProviderId;
  structured?: {
    schema: Record<string, unknown>;
    strict?: boolean;
  };
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  caller?: string;
  noFallback?: boolean;
}

export interface GatewayResponse {
  text: string;
  provider: ProviderId;
  model: string;
  latencyMs: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  fellBackTo?: ProviderId;
  finishReason?: string;
  requestId: string;
}

export interface GatewayStreamChunk {
  delta: string;
  provider: ProviderId;
  model: string;
  done: boolean;
  requestId: string;
  usage?: GatewayResponse['usage'];
  fellBackTo?: ProviderId;
}

export interface ProviderHealthSnapshot {
  id: ProviderId;
  label: string;
  enabled: boolean;
  health: ProviderHealth;
  consecutiveFailures: number;
  lastError?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  defaultModel: string;
  availableModels: string[];
  paid: boolean;
}

export interface UserUsageSnapshot {
  userId: string;
  plan: string;
  windowStart: string;
  requests: number;
  tokensUsed: number;
  requestLimit: number;
  tokenLimit: number;
  byProvider: Partial<Record<ProviderId, { requests: number; tokens: number }>>;
}
