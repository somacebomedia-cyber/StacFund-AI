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

  return new GoogleGenAI({
    apiKey: 'proxy',
    httpOptions: {
      baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:3000/api/gemini',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    }
  });
}
