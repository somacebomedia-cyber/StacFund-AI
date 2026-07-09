import { auth } from './firebase';

export interface StockPhoto {
  url: string;
  photographer: string;
  photographerUrl?: string;
  source: 'pexels' | 'pixabay';
}

const memoryCache = new Map<string, StockPhoto[]>();

export async function searchStockPhotos(query: string): Promise<StockPhoto[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  // Return cached results if available
  if (memoryCache.has(trimmed)) {
    return memoryCache.get(trimmed) || [];
  }

  try {
    const user = auth.currentUser;
    let token = '';
    if (user) {
      try {
        token = await user.getIdToken();
      } catch (error) {
        console.warn('Failed to get Firebase ID token for Stock API:', error);
      }
    }

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`/api/stock-photos/search?q=${encodeURIComponent(trimmed)}`, {
      headers
    });

    if (!response.ok) {
      throw new Error(`Stock API returned ${response.status}`);
    }

    const data = await response.json();
    const photos: StockPhoto[] = data.photos || [];

    // Cache the results
    memoryCache.set(trimmed, photos);
    return photos;
  } catch (error) {
    console.error('Error in searchStockPhotos service:', error);
    return [];
  }
}
