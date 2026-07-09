import { createGeminiClient } from '../services/geminiClient';
import { searchStockPhotos, StockPhoto } from '../services/stockPhotos';

export type ImageSourceMode = 'auto' | 'ai' | 'stock';

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
