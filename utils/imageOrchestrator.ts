import { createGeminiClient } from '../services/geminiClient';
import { searchStockPhotos, StockPhoto } from '../services/stockPhotos';

export type ImageSourceMode = 'auto' | 'ai' | 'stock';

export interface ImageAttribution {
  photographer: string;
  source: string;
}

export function getImageSourceModeLabel(mode: ImageSourceMode): string {
  if (mode === 'ai') return 'AI Only';
  if (mode === 'stock') return 'Stock Only';
  return 'Auto Fallback';
}

export function getImageSourceModeDescription(mode: ImageSourceMode): string {
  if (mode === 'ai') return 'Strict AI generation using Gemini Imagen 3.0.';
  if (mode === 'stock') return 'Real stock photos from Pexels and Pixabay.';
  return 'AI generation first, automatic fallback to stock photos if AI fails.';
}

export function deriveStockSearchQuery(prompt: string, title: string): string {
  let query = (prompt || title || '').trim();
  // Standard clean up for better matches
  query = query.replace(/style:.*$/i, '');
  query = query.replace(/(vector art|flat design|high quality|minimalist|cinematic|professional)/gi, '');
  return query.slice(0, 40).trim();
}

export async function generateSlideImage({
  prompt,
  searchQuery,
  slideType,
  swatchColors,
  themeName,
  slideIndex,
  mode,
}: {
  prompt: string;
  searchQuery: string;
  slideType: 'cover' | 'content' | 'data' | 'quote';
  swatchColors: string[];
  themeName: string;
  slideIndex: number;
  mode: ImageSourceMode;
}): Promise<{ imageData: string; attribution?: ImageAttribution; source: 'ai' | 'stock' }> {
  const result = await generateOrGetImage(
    prompt,
    searchQuery,
    slideType,
    themeName,
    swatchColors?.[0] || '#ffffff',
    mode
  );
  if (!result) {
    throw new Error('Failed to generate or retrieve image');
  }

  let attributionObj: ImageAttribution | undefined = undefined;
  if (result.attribution) {
    // result.attribution is like: "Photo: Photographer Name / Source"
    const match = result.attribution.match(/Photo:\s*(.*?)\s*\/\s*(.*)/i);
    if (match) {
      attributionObj = {
        photographer: match[1].trim(),
        source: match[2].trim(),
      };
    } else {
      attributionObj = {
        photographer: 'Unknown',
        source: result.attribution,
      };
    }
  }

  return {
    imageData: result.url,
    attribution: attributionObj,
    source: result.source,
  };
}

interface ImageResult {
  url: string;
  attribution?: string;
  source: 'ai' | 'stock';
}

export async function generateOrGetImage(
  slideTitle: string,
  visualPrompt: string,
  slideType: 'cover' | 'content' | 'data' | 'quote',
  themeName: string,
  themeAccent: string,
  mode: ImageSourceMode
): Promise<ImageResult | null> {
  const query = (visualPrompt || slideTitle || '').trim();
  if (!query) return null;

  // 1. Stock-only mode
  if (mode === 'stock') {
    return await fetchStockFallback(query);
  }

  // 2. AI-only mode
  if (mode === 'ai') {
    return await generateAIImage(slideTitle, visualPrompt, slideType, themeName, themeAccent);
  }

  // 3. Auto mode (AI with stock fallback)
  try {
    console.log('[ImageOrchestrator] Auto Mode: Attempting AI generation...');
    const aiResult = await generateAIImage(slideTitle, visualPrompt, slideType, themeName, themeAccent);
    if (aiResult) return aiResult;
  } catch (error) {
    console.warn('[ImageOrchestrator] AI generation failed, falling back to Stock Photos:', error);
  }

  console.log('[ImageOrchestrator] Auto Mode: AI failed or was skipped. Querying stock photo databases...');
  return await fetchStockFallback(query);
}

// Sub-helper to call Gemini Imagen API
async function generateAIImage(
  slideTitle: string,
  visualPrompt: string,
  slideType: 'cover' | 'content' | 'data' | 'quote',
  themeName: string,
  themeAccent: string
): Promise<ImageResult | null> {
  const ai = await createGeminiClient();

  let stylePrompt = `Style: High quality, professional, vector art, flat design, ${themeName} color palette (${themeAccent} accent).`;
  if (slideType === 'data') {
    stylePrompt += " Create a clean, modern infographic chart visualization on a dark background.";
  } else if (slideType === 'cover') {
    stylePrompt += " Heroic, cinematic composition, minimalist.";
  } else {
    stylePrompt += " Professional corporate illustration.";
  }

  const promptText = `${visualPrompt || slideTitle}. ${stylePrompt}`;

  try {
    const response = await ai.models.generateImages({
      model: 'imagen-3.0-generate-002',
      prompt: promptText,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '16:9'
      }
    });

    if (response.generatedImages?.[0]?.image?.imageBytes) {
      const base64 = response.generatedImages[0].image.imageBytes;
      return {
        url: `data:image/jpeg;base64,${base64}`,
        source: 'ai'
      };
    }
  } catch (err) {
    console.error('[ImageOrchestrator] Imagen API Error:', err);
    throw err;
  }

  return null;
}

// Sub-helper to search stock and format attribution
async function fetchStockFallback(query: string): Promise<ImageResult | null> {
  try {
    // Standardize query to make it friendly for stock photo search engines
    // (e.g. remove descriptive "Style:" or "vector" instructions to find real, relevant photos)
    const stockSearchQuery = cleanQueryForStock(query);
    console.log(`[ImageOrchestrator] Cleaned stock photo query: "${stockSearchQuery}"`);

    const photos = await searchStockPhotos(stockSearchQuery);
    if (photos && photos.length > 0) {
      // Pick the first photo or random top 3 to keep it fresh
      const selected = photos[0];
      const attribution = `Photo: ${selected.photographer} / ${selected.source}`;
      return {
        url: selected.url,
        attribution,
        source: 'stock'
      };
    }
  } catch (error) {
    console.error('[ImageOrchestrator] Stock photo fallback failed:', error);
  }
  return null;
}

// Clean up prompts that look like detailed AI instructions to get better search matches
function cleanQueryForStock(prompt: string): string {
  let cleaned = prompt;
  
  // Remove formatting or background requests
  cleaned = cleaned.replace(/style:.*$/i, '');
  cleaned = cleaned.replace(/on a (dark|light) background/i, '');
  cleaned = cleaned.replace(/(vector art|flat design|high quality|minimalist|cinematic|professional)/gi, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Cut down long sentences to core search concepts (e.g. first 5 words)
  const words = cleaned.split(' ');
  if (words.length > 6) {
    return words.slice(0, 5).join(' ');
  }
  
  return cleaned || 'business growth';
}
