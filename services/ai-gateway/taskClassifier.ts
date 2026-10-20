// services/ai-gateway/taskClassifier.ts
/**
 * StacFund AI Gateway — Task Classifier
 *
 * If the caller doesn't explicitly set `task`, infer it from the request.
 * This is intentionally simple and deterministic — no LLM-as-router here,
 * that would be both expensive and unpredictable.
 *
 * Heuristics:
 *   - If any message has an `image` → image_understanding
 *   - If `structured` schema is set + caller mentions "extract"/"form"/"parse"
 *     → document_extraction
 *   - Long system prompt containing "business plan" → business_plan
 *   - "pitch deck" / "slide" → pitch_deck
 *   - "funding" + "analyse"/"analyze" → funding_analysis
 *   - "summarise"/"summarize"/"tl;dr" → summarization
 *   - "classify"/"categorise"/"route" → classification
 *   - Default → chat
 */
import type { AiTask, GatewayRequest } from './types';

export function classifyTask(req: GatewayRequest): AiTask {
  if (req.task && req.task !== 'default') return req.task;

  // Image input → vision
  if (req.messages.some((m) => m.image?.url)) {
    return 'image_understanding';
  }

  // Concatenate all text for keyword matching (lower-cased).
  const text = req.messages
    .map((m) => m.content || '')
    .join('\n')
    .toLowerCase();
  const caller = (req.caller || '').toLowerCase();

  if (req.structured) {
    if (
      text.includes('extract') ||
      text.includes('form') ||
      text.includes('parse') ||
      caller.includes('digitizer') ||
      caller.includes('whatsapp')
    ) {
      return 'document_extraction';
    }
  }

  if (text.includes('business plan') || caller.includes('businessplan')) return 'business_plan';
  if (text.includes('pitch deck') || text.includes('slide') || caller.includes('pitchdeck')) {
    return 'pitch_deck';
  }
  if (
    (text.includes('funding') && (text.includes('analys') || text.includes('analyz'))) ||
    caller.includes('funding')
  ) {
    return 'funding_analysis';
  }
  if (text.includes('summaris') || text.includes('summariz') || text.includes('tldr') || text.includes('tl;dr')) {
    return 'summarization';
  }
  if (text.includes('classif') || text.includes('categoris') || text.includes('categoriz')) {
    return 'classification';
  }
  if (text.includes('reason') || text.includes('step by step') || text.includes('think through')) {
    return 'reasoning';
  }

  return 'chat';
}
