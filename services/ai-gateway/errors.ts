// services/ai-gateway/errors.ts
/**
 * StacFund AI Gateway — Unified Error Types
 *
 * Every provider adapter converts its native errors into one of these.
 * The router inspects `retryable` and `kind` to decide whether to fall
 * back to the next provider in the chain.
 */
import type { ProviderId } from './types';

export type GatewayErrorKind =
  | 'quota_exhausted' // 429 / RESOURCE_EXHAUSTED — provider rate-limited
  | 'auth_invalid' // 401 / API key bad
  | 'bad_request' // 400 / malformed request
  | 'provider_unavailable' // 5xx / network / timeout
  | 'circuit_open' // circuit breaker tripped
  | 'no_provider' // no eligible provider for this task
  | 'rate_limited_user' // user blew their own per-user limit
  | 'aborted' // caller cancelled
  | 'unknown'; // anything else

export class GatewayError extends Error {
  readonly kind: GatewayErrorKind;
  readonly retryable: boolean;
  readonly provider?: ProviderId;
  readonly statusCode: number;
  readonly cause?: unknown;
  requestId?: string;

  constructor(params: {
    kind: GatewayErrorKind;
    message: string;
    retryable?: boolean;
    provider?: ProviderId;
    statusCode?: number;
    cause?: unknown;
    requestId?: string;
  }) {
    super(params.message);
    this.name = 'GatewayError';
    this.kind = params.kind;
    this.retryable = params.retryable ?? false;
    this.provider = params.provider;
    this.statusCode = params.statusCode ?? 500;
    this.cause = params.cause;
    this.requestId = params.requestId;
  }

  toJSON() {
    return {
      error: {
        code: this.kind,
        message: this.message,
        provider: this.provider,
        retryable: this.retryable,
        requestId: this.requestId,
      },
    };
  }
}

/** Convert any thrown value into a GatewayError. */
export function toGatewayError(err: unknown, provider?: ProviderId): GatewayError {
  if (err instanceof GatewayError) return err;

  const msg = (err as { message?: string })?.message || String(err);
  const status = (err as { status?: number; statusCode?: number; code?: number })?.status
    || (err as { statusCode?: number })?.statusCode
    || (err as { code?: number })?.code;
  const statusStr = String(status || '');
  const lower = msg.toLowerCase();

  // Quota / rate-limit signals
  if (
    statusStr === '429' ||
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit')
  ) {
    return new GatewayError({
      kind: 'quota_exhausted',
      message: msg,
      retryable: true,
      provider,
      statusCode: 429,
      cause: err,
    });
  }

  // Auth
  if (
    statusStr === '401' ||
    statusStr === '403' ||
    lower.includes('unauthorized') ||
    lower.includes('api key not valid') ||
    lower.includes('api_key_invalid') ||
    lower.includes('invalid api key')
  ) {
    return new GatewayError({
      kind: 'auth_invalid',
      message: msg,
      retryable: false,
      provider,
      statusCode: 401,
      cause: err,
    });
  }

  // Bad request
  if (statusStr === '400' || lower.includes('invalid_argument') || lower.includes('bad request')) {
    return new GatewayError({
      kind: 'bad_request',
      message: msg,
      retryable: false,
      provider,
      statusCode: 400,
      cause: err,
    });
  }

  // 5xx / network / timeout
  if (
    statusStr === '503' ||
    statusStr === '502' ||
    statusStr === '504' ||
    lower.includes('unavailable') ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('try again later') ||
    lower.includes('high demand')
  ) {
    return new GatewayError({
      kind: 'provider_unavailable',
      message: msg,
      retryable: true,
      provider,
      statusCode: 503,
      cause: err,
    });
  }

  return new GatewayError({
    kind: 'unknown',
    message: msg,
    retryable: false,
    provider,
    statusCode: 500,
    cause: err,
  });
}
