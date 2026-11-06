// services/geminiClient.ts
/**
 * Client-side Gemini client.
 *
 * Returns a GoogleGenAI instance configured to talk to the server-side proxy
 * at /api/gemini/. The server proxy injects the real GEMINI_API_KEY from env
 * — the client never sees it.
 *
 * SECURITY (2026-10-20): The previous version of this file read a user-supplied
 * "custom Gemini API key" from localStorage and sent it as the
 * `x-custom-gemini-key` header. That mechanism has been REMOVED by default
 * for security reasons (it allowed user-supplied keys to be sent through
 * the server proxy, which is a credential-exposure risk and an abuse vector).
 *
 * All provider credentials now live server-side. The server's AI Gateway
 * (/api/ai/gateway/*) is the recommended path for new code. This client is
 * kept for backward compatibility with components that haven't been migrated
 * yet.
 *
 * If you genuinely need BYOK behaviour (e.g. local dev with your own key),
 * set STACFUND_ALLOW_CUSTOM_GEMINI_KEY=true on the server AND populate
 * localStorage['stacfund_custom_gemini_api_key'] — but this is strongly
 * discouraged for production.
 */
import { GoogleGenAI } from '@google/genai';
import { auth } from './firebase';

export async function createGeminiClient(): Promise<GoogleGenAI> {
  const user = auth.currentUser;
  let token = '';
  if (user) {
    try {
      token = await user.getIdToken();
    } catch (error) {
      console.warn('Failed to get Firebase ID token for Gemini proxy:', error);
    }
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Only attach the custom-key header if the server has explicitly opted in
  // to the BYOK mechanism. We can't read the server's env from the client,
  // but we gate this on a client-side flag (set by an admin in localStorage)
  // so the default behaviour for end users is "no BYOK".
  const allowByok = typeof window !== 'undefined'
    && localStorage.getItem('stacfund_enable_byok') === 'true';
  if (allowByok) {
    const customApiKey = typeof window !== 'undefined'
      ? localStorage.getItem('stacfund_custom_gemini_api_key')
      : null;
    if (customApiKey) {
      headers['x-custom-gemini-key'] = customApiKey;
    }
  }

  return new GoogleGenAI({
    apiKey: 'proxy',
    httpOptions: {
      baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini/' : 'http://localhost:3000/api/gemini/',
      headers: Object.keys(headers).length > 0 ? headers : undefined
    }
  });
}

/**
 * Resilient retry wrapper with exponential backoff for Gemini calls.
 * Automatically catches HTTP 429 (rate limits), quota warnings, 503s, and network drops,
 * backing off gracefully so batch generations (like Business Plans and Proposals) do not fail.
 */
export async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1500
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const msg = (err?.message || String(err)).toLowerCase();
      const isRateOrTransient =
        msg.includes('429') ||
        msg.includes('resource_exhausted') ||
        msg.includes('quota') ||
        msg.includes('too many requests') ||
        msg.includes('rate limit') ||
        msg.includes('503') ||
        msg.includes('overloaded') ||
        msg.includes('econnreset') ||
        msg.includes('fetch failed') ||
        msg.includes('network');

      if (attempt > maxRetries || !isRateOrTransient) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 400;
      console.warn(`[Gemini Retry] Attempt ${attempt} encountered transient issue (${err?.message || err}). Retrying in ${Math.round(delay)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
