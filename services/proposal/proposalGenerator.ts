// services/proposal/proposalGenerator.ts
/**
 * StacFund — Two-stage proposal generator (presenton/Gamma pattern, adapted
 * for flowing funding documents instead of slides)
 * =====================================================================
 *
 * STAGE 1 — OUTLINE.  One fast Gemini call produces the document skeleton:
 * which sections, in what order, each with a tailored title, a one-line
 * brief of what it must argue, and key points to cover. The user reviews
 * and edits this BEFORE any long generation happens (cheap, instant,
 * Canva-like feeling of control).
 *
 * STAGE 2 — FILL.  Each section is filled by its OWN focused Gemini call.
 * Benefits vs one giant single-shot call (the old generateBusinessPlan):
 *   - focused context per section → materially better prose quality
 *   - sections can be regenerated / rewritten individually in seconds
 *   - a failure in one section never loses the others
 *   - progress is shown per-section in the UI
 *
 * Both stages use Gemini structured output (responseSchema), the same
 * client-side proxy pattern as utils/outlineGenerator.ts.
 *
 * The compliance section is NOT generated here — it is built determin-
 * istically in code from the AutofillContext (buildComplianceSection),
 * because funder-facing checklists must never be hallucinated.
 */
import { Type } from '@google/genai';
import { createGeminiClient } from '../geminiClient';
import type { AutofillContext } from '../autofillContext';
import {
  type SectionKind,
  type ProposalSection,
  newSectionId,
  SECTION_KIND_LABELS,
  SECTION_KIND_BRIEFS,
} from './proposalSchema';

const MODEL = 'gemini-3.8-flash';

export interface ProposalGenRequest {
  businessName: string;
  /** What the funding is for, in the owner's own words. */
  purpose: string;
  /** Formatted amount label, e.g. "R500 000" (may be empty). */
  requestedAmountLabel: string;
  /** Structured context from buildAutofillContext().promptBlock — the moat. */
  contextBlock: string;
}

// ─── Stage 1: Outline ────────────────────────────────────────────────────────

const KIND_ENUM: SectionKind[] = [
  'executive_summary', 'about_business', 'problem', 'market_analysis',
  'competitive_advantage', 'operations', 'team', 'financial_plan',
  'funding_request', 'impact', 'risk',
];

/**
 * Generates the document outline. Returns sections in presentation order,
 * each with a tailored title, brief, and 3-5 key points.
 */
export async function generateProposalOutline(req: ProposalGenRequest): Promise<ProposalSection[]> {
  const ai = await createGeminiClient();

  const prompt = `You are a South African funding consultant structuring a funding proposal document for ${req.businessName}.

${req.contextBlock}

APPLICANT INPUT:
- Business: ${req.businessName}
- Funding requested: ${req.requestedAmountLabel || 'Not specified — infer a sensible range from the tiers above'}
- Stated purpose: ${req.purpose || 'General business growth'}

TASK: Choose the 6 to 9 strongest sections for THIS proposal, in the right order for THIS funder. You may drop sections that add no value (e.g. skip "team" only if the context gives you nothing to say), but the Executive Summary MUST be first and the Funding Request MUST be included.

For every chosen section write:
- "title": a specific, professional section title tailored to this business and funder (never the generic label alone — e.g. "Market Opportunity in KwaZulu-Natal's Township Retail Sector", not "Market Analysis").
- "brief": ONE sentence describing exactly what this section will argue.
- "keyPoints": 3 to 5 specific points the section must cover. Use real details from the context block (ZAR figures, provinces, job counts, funder requirements). Never invent numbers that contradict the context.

TONE: professional South African business English. Use R/ZAR currency formatting (e.g. R1.2m or R500 000).
OUTPUT: JSON array only, via the provided schema. No markdown fences.`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            kind: { type: Type.STRING, enum: KIND_ENUM },
            title: { type: Type.STRING },
            brief: { type: Type.STRING },
            keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['kind', 'title', 'brief', 'keyPoints'],
        },
      },
    },
  });

  let parsed: Array<{ kind: string; title: string; brief: string; keyPoints: string[] }>;
  try {
    parsed = JSON.parse(response.text || '[]');
  } catch {
    // Recovery: trim to the outermost brackets (same spirit as the
    // ApplicationWorkflow JSON recovery, but simpler since schema is an array).
    const text = (response.text || '').trim();
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) throw new Error('Outline response was not valid JSON');
    parsed = JSON.parse(text.substring(start, end + 1));
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('The AI returned an empty outline. Please try again.');
  }

  // Guarantee: executive summary first, funding request present.
  const normalised = parsed.filter((s) => KIND_ENUM.includes(s.kind as SectionKind));
  const byKind = new Map(normalised.map((s) => [s.kind, s]));
  if (!byKind.has('executive_summary')) {
    normalised.unshift({
      kind: 'executive_summary',
      title: 'Executive Summary',
      brief: SECTION_KIND_BRIEFS.executive_summary,
      keyPoints: ['Who the business is', 'What the funding unlocks', 'Why this funder should say yes'],
    });
  }
  if (!byKind.has('funding_request')) {
    normalised.push({
      kind: 'funding_request',
      title: 'Funding Request & Use of Funds',
      brief: SECTION_KIND_BRIEFS.funding_request,
      keyPoints: ['Exact amount requested', 'Itemised use of funds', 'Alignment with the funder\u2019s tiers'],
    });
  }

  return normalised.map((s) => ({
    id: newSectionId(),
    kind: s.kind as SectionKind,
    title: s.title || SECTION_KIND_LABELS[s.kind as SectionKind] || 'Section',
    brief: s.brief || SECTION_KIND_BRIEFS[s.kind as SectionKind] || '',
    keyPoints: Array.isArray(s.keyPoints) ? s.keyPoints.slice(0, 6) : [],
    include: true,
    status: 'outline' as const,
    paragraphs: [],
    bullets: [],
    stats: [],
    table: null,
  }));
}

// ─── Stage 2: Fill one section ───────────────────────────────────────────────

export async function fillProposalSection(
  section: ProposalSection,
  req: ProposalGenRequest,
  extraInstruction?: string
): Promise<ProposalSection> {
  const ai = await createGeminiClient();

  const prompt = `You are a South African funding consultant writing ONE section of a funding proposal for ${req.businessName}.

${req.contextBlock}

APPLICANT INPUT:
- Business: ${req.businessName}
- Funding requested: ${req.requestedAmountLabel || 'Not specified'}
- Stated purpose: ${req.purpose || 'General business growth'}

SECTION TO WRITE:
- Section title: ${section.title}
- This section must argue: ${section.brief}
- It must cover these key points: ${section.keyPoints.map((p) => `\u2022 ${p}`).join('\n  ')}
${extraInstruction ? `\nADDITIONAL INSTRUCTION FROM THE USER (highest priority): ${extraInstruction}` : ''}

WRITE:
- "paragraphs": 2 to 4 paragraphs of polished, specific prose (60-110 words each). Ground every claim in the context block; where a figure is genuinely unknown, write a sensible placeholder in [square brackets] the applicant can replace — never invent contradictory numbers.
- "bullets": 3 to 5 high-signal bullets for readers who skim.
- "stats": 2 to 4 headline numbers as {value, label}. Values are SHORT (e.g. "R1.2m", "14", "62%"). Only use figures from the context or clearly-marked placeholders.
- "table": for financial_plan or funding_request sections ONLY — a table (columns + rows, all strings). For funding_request: "Use of Funds" with categories and amounts that sum to the requested total. For financial_plan: a simple 3-year projection with [placeholders] where needed. For every other section return null.

TONE: confident, concrete, South African business English. R/ZAR formatting.
OUTPUT: JSON only via the provided schema. No markdown fences.`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          paragraphs: { type: Type.ARRAY, items: { type: Type.STRING } },
          bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
          stats: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING },
                label: { type: Type.STRING },
              },
              required: ['value', 'label'],
            },
          },
          table: {
            type: Type.OBJECT,
            properties: {
              caption: { type: Type.STRING },
              columns: { type: Type.ARRAY, items: { type: Type.STRING } },
              rows: {
                type: Type.ARRAY,
                items: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
            required: ['columns', 'rows'],
          },
        },
        required: ['paragraphs', 'bullets', 'stats'],
      },
    },
  });

  let parsed: any;
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch {
    const text = (response.text || '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Section response was not valid JSON');
    parsed = JSON.parse(text.substring(start, end + 1));
  }

  const table =
    parsed.table && Array.isArray(parsed.table.columns) && Array.isArray(parsed.table.rows) && parsed.table.rows.length > 0
      ? {
          caption: parsed.table.caption || undefined,
          columns: parsed.table.columns.map((c: any) => String(c)),
          rows: parsed.table.rows.map((r: any) => (Array.isArray(r) ? r.map((c: any) => String(c ?? '')) : [])),
        }
      : null;

  return {
    ...section,
    status: 'filled',
    paragraphs: Array.isArray(parsed.paragraphs) ? parsed.paragraphs.map((p: any) => String(p)) : [],
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets.map((b: any) => String(b)) : [],
    stats: Array.isArray(parsed.stats)
      ? parsed.stats
          .filter((s: any) => s && s.value)
          .map((s: any) => ({ value: String(s.value), label: String(s.label || '') }))
          .slice(0, 4)
      : [],
    table,
  };
}

// ─── Deterministic compliance section (no AI) ────────────────────────────────

/**
 * Builds the Compliance & Document Checklist section from the AutofillContext.
 * Deterministic by design: funder-facing checklists must reflect the real
 * eligibility engine verdicts and the real document vault, not AI prose.
 */
export function buildComplianceSection(ctx: AutofillContext): ProposalSection {
  const verdictMark = (v: 'pass' | 'fail' | 'unknown') =>
    v === 'pass' ? 'Meets requirement' : v === 'fail' ? 'Does not meet' : 'To confirm';

  const ruleRows: string[][] = (ctx.eligibility.rules || []).map((r) => [
    r.label,
    verdictMark(r.verdict),
    r.reason || '',
  ]);

  const docRows: string[][] = ctx.requiredDocuments.map((doc) => [
    doc,
    ctx.matchedDocuments.some((m) => m.toLowerCase() === doc.toLowerCase()) ? 'In vault' : 'To upload',
    '',
  ]);

  const allRows = [
    ...ruleRows,
    ...docRows,
  ];

  const summaryParagraph =
    ctx.eligibility.eligible && !ctx.eligibility.hasUnknowns
      ? `This application meets every hard eligibility rule for ${ctx.opportunity.programme_name || 'this programme'}. All required documents listed below are either already in the applicant's document vault or attached to this submission.`
      : ctx.eligibility.eligible
        ? `This application meets the hard eligibility rules that could be verified from the applicant's profile. Items marked "To confirm" below require confirmation at submission, and the applicant is preparing every listed document.`
        : `The applicant has noted the eligibility gaps below and is addressing them alongside this submission. Items marked "Does not meet" are being resolved with the funder's listed remediation options where available.`;

  return {
    id: newSectionId(),
    kind: 'compliance',
    title: 'Compliance & Document Checklist',
    brief: 'Deterministic checklist generated from the funder\u2019s published rules and the applicant\u2019s document vault.',
    keyPoints: [],
    include: true,
    status: 'filled',
    deterministic: true,
    paragraphs: [summaryParagraph],
    bullets: [],
    stats: [
      { value: String(ctx.eligibility.rules.filter((r) => r.verdict === 'pass').length), label: 'Rules met' },
      { value: String(ctx.matchedDocuments.length), label: 'Documents in vault' },
      { value: String(ctx.missingDocuments.length), label: 'To upload' },
    ],
    table: {
      caption: `Checklist — ${ctx.opportunity.issuer_name || 'Funder'}`,
      columns: ['Requirement', 'Status', 'Notes'],
      rows: allRows.length ? allRows : [['No published rules or document list for this programme', '—', '']],
    },
  };
}

// ─── Minimal context fallback (no opportunity selected) ─────────────────────

/**
 * When the user builds a "general" proposal with no specific opportunity,
 * we still give the AI a structured context from the basics they typed.
 */
export function buildMinimalContextBlock(req: Omit<ProposalGenRequest, 'contextBlock'>): string {
  return [
    'CONTEXT (general funding proposal — no specific funder selected):',
    `- Business: ${req.businessName}`,
    `- Funding requested: ${req.requestedAmountLabel || 'Not specified'}`,
    `- Purpose: ${req.purpose || 'General business growth'}`,
    'Write for a generic South African development-finance audience (SEFA / NEF / bank style):',
    'emphasise viability, job creation, and socio-economic impact.',
  ].join('\n');
}
