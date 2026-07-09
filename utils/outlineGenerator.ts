import { Type } from '@google/genai';
import { createGeminiClient } from '../services/geminiClient';
import { SlideOutline, PitchStrategy } from './outlineStrategies';

export async function generateSlideOutline(
  docName: string,
  businessName: string,
  strategy: PitchStrategy,
  docContent: string
): Promise<SlideOutline[]> {
  const ai = await createGeminiClient();

  const prompt = `
    You are an expert pitch consultant. Create a comprehensive, investor-ready pitch deck outline for a business named "${businessName}" based on their business plan/document titled "${docName}".
    
    You MUST strictly follow this pitch strategy structure:
    Strategy Name: ${strategy.name}
    Strategy Description: ${strategy.description}
    
    Here are the expected slides, layout rules, and emotional tones you must map to:
    ${JSON.stringify(strategy.slides, null, 2)}
    
    Use the following core business plan source text to extract highly accurate details, ZAR financial figures, market gaps, BEE alignment, socio-economic metrics, etc. Do not invent details that contradict the source text:
    ---
    ${docContent.slice(0, 30000)}
    ---
    
    CRITICAL INSTRUCTIONS:
    1. Output EXACTLY ${strategy.slides.length} slides. Match the sequence of types, layouts, copyFormulas, emotions, and roles given in the strategy.
    2. For each slide, write a tailored 'title' (inspired by the template title but specific to this business).
    3. Generate 3 to 5 clear, high-impact bullet points ('points' array) for each slide. For 'cover' slides, write 1 punchy value proposition. For 'data' slides, write key stats in the format "value:label" (e.g., "R5.2M:Projected Year 1 Revenue" or "12:Permanent Jobs Created").
    4. Provide a highly descriptive 'visualPrompt' for an image generator (vector art style, matching the theme palette) that fits the slide contents.
    5. Ensure the text is written in standard professional English with a South African business context (using R/ZAR currency, local municipal or provincial contexts if mentioned in the text).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['cover', 'content', 'data', 'quote'] },
              layout: { type: Type.STRING },
              copyFormula: { type: Type.STRING },
              emotion: { type: Type.STRING },
              role: { type: Type.STRING },
              points: { type: Type.ARRAY, items: { type: Type.STRING } },
              visualPrompt: { type: Type.STRING }
            },
            required: ['title', 'type', 'layout', 'copyFormula', 'emotion', 'role', 'points', 'visualPrompt']
          }
        }
      }
    });

    const parsedSlides = JSON.parse(response.text || '[]');
    return parsedSlides.map((slide: any, idx: number) => ({
      ...slide,
      id: `slide_${idx}_${Date.now()}`
    }));
  } catch (error) {
    console.error('Error generating slide outline:', error);
    throw error;
  }
}

export async function regenerateSingleSlide(
  slide: SlideOutline,
  docContent: string,
  businessName: string
): Promise<SlideOutline> {
  const ai = await createGeminiClient();

  const prompt = `
    You are an expert pitch consultant. Regenerate the content for a single pitch deck slide for the business "${businessName}".
    
    Current slide details:
    - Current Title: ${slide.title}
    - Slide Type: ${slide.type}
    - Layout: ${slide.layout}
    - Copy Formula: ${slide.copyFormula}
    - Emotion/Tone: ${slide.emotion}
    - Role in Pitch: ${slide.role}
    
    Please use this business plan text as reference:
    ---
    ${docContent.slice(0, 15000)}
    ---
    
    Generate a brand new, highly polished, and persuasive title, 3 to 5 refined points (for cover slide: 1 value prop, for data slide: "value:label" format), and a high-fidelity image generator visualPrompt. Ensure it fits the slide's role, copy formula, layout, and emotional tone perfectly.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            points: { type: Type.ARRAY, items: { type: Type.STRING } },
            visualPrompt: { type: Type.STRING }
          },
          required: ['title', 'points', 'visualPrompt']
        }
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    return {
      ...slide,
      title: parsed.title || slide.title,
      points: parsed.points || slide.points,
      visualPrompt: parsed.visualPrompt || slide.visualPrompt
    };
  } catch (error) {
    console.error('Error regenerating single slide:', error);
    throw error;
  }
}
