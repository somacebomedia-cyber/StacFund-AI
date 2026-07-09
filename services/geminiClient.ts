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

  const customApiKey = typeof window !== 'undefined' ? localStorage.getItem('stacfund_custom_gemini_api_key') : null;

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (customApiKey) {
    headers['x-custom-gemini-key'] = customApiKey;
  }

  return new GoogleGenAI({
    apiKey: 'proxy',
    httpOptions: {
      baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:3000/api/gemini',
      headers: Object.keys(headers).length > 0 ? headers : undefined
    }
  });
}

