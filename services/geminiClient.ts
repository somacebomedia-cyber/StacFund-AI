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
