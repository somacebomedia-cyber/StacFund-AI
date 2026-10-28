// services/businessPlan/planGenerator.ts
/**
 * StacFund — Long-form business plan generator (the outline→fill pipeline)
 * ========================================================================
 * Presenton's two-stage pattern, engineered for 70–120 page documents:
 *
 *   STAGE 0  buildPlanSkeleton()   — deterministic structure from the depth
 *                                    engine + chapter catalog. No AI here:
 *                                    the page contract must be guaranteed.
 *   STAGE 0.5 generatePlanTailoring() — ONE AI call that tailors the skeleton
 *                                    to THIS business: names the offerings,
 *                                    proposes the business models, defines
 *                                    the audience personas, and writes the
 *                                    chapter opener summaries.
 *   STAGE 1  fillPlanSubsection()  — each subsection is filled by its OWN
 *                                    focused call with a WORD BUDGET and a
 *                                    block RECIPE (shape contract). Output
 *                                    is validated: too-short sections get
 *                                    one corrective expansion pass.
 *
 * Deterministic-by-design: the compliance checklist and use-of-funds totals
 * are built in code from the AutofillContext, never hallucinated.
 */
import { Type } from '@google/genai';
import { createGeminiClient } from '../geminiClient';
import type { AutofillContext } from '../autofillContext';
import {
  type PlanBlock,
  type PlanChapter,
  type PlanDocument,
  type PlanSubsection,
  coerceBlocks,
  newId,
  subsectionWordCount,
} from './planSchema';
import {
  type DepthProfile,
  allocateChapterBudgets,
  splitBudgetAcrossSubsections,
} from './planDepth';
import {
  CHAPTER_CATALOG,
  type ChapterTemplate,
  type SubsectionTemplate,
  poolTakeCount,
} from './planStructure';
import {
  type FundingNeedsSummary,
  buildUseOfFundsSubsection,
  fundingNeedsContextBlock,
} from './planFinancials';

const MODEL = 'gemini-3.8-flash';

// ─── Request type ────────────────────────────────────────────────────────────

export interface PlanGenRequest {
  businessName: string;
  purpose: string;
  requestedAmountLabel: string;
  /** Raw rand amount when known (drives nothing here — depth already set). */
  requestedAmountRand?: number;
  /** Structured context from buildAutofillContext().promptBlock. */
  contextBlock: string;
  /**
   * The applicant's REAL costed funding-needs register. When present with
   * items, the Financial Plan's use-of-funds subsection becomes deterministic
   * (built in code) and every fill call receives the authoritative figures.
   */
  fundingNeedsSummary?: FundingNeedsSummary | null;
}

export function buildMinimalPlanContext(req: Omit<PlanGenRequest, 'contextBlock'>): string {
  return [
    'CONTEXT (general business plan — no specific funder selected):',
    `- Business: ${req.businessName}`,
    `- Funding requested: ${req.requestedAmountLabel || 'Not specified'}`,
    `- Purpose: ${req.purpose || 'General business growth'}`,
    'Write for a South African development-finance audience (SEFA / NEF / IDC / bank credit committee style):',
    'sober, evidence-led, focused on viability, job creation and socio-economic impact.',
  ].join('\n');
}

// ─── Stage 0.5: tailoring call ───────────────────────────────────────────────

export interface PlanTailoring {
  offerings: { title: string; brief: string; keyPoints: string[] }[];
  models: { title: string; brief: string; recommended: boolean }[];
  personas: { title: string; sharePct: number; brief: string; keyPoints: string[] }[];
  subsectionTailoring: Record<string, { title: string; brief: string }>;
  chapterSummaries: Record<string, string>;
}

interface TailoringCounts {
  offerings: number;
  models: number;
  personas: number;
}

export function tailoringCountsForDepth(depth: DepthProfile): TailoringCounts {
  const r = depth.expansionRatio;
  return {
    offerings: 2 + Math.round(r * 2),        // 2 – 4
    models: 3 + Math.round(r * 2),           // 3 – 5
    personas: 3 + Math.round(r * 3),         // 3 – 6
  };
}

/**
 * ONE call that tailors the deterministic skeleton to this business.
 * Returns named offerings, candidate business models, audience personas,
 * optional re-titles for catalog subsections, and chapter summaries.
 */
export async function generatePlanTailoring(req: PlanGenRequest, depth: DepthProfile): Promise<PlanTailoring> {
  const ai = await createGeminiClient();
  const counts = tailoringCountsForDepth(depth);

  const chapterMenu = CHAPTER_CATALOG.map((c) => `${c.id}: ${c.title}`).join('\n');

  const prompt = `You are a South African business consultant planning a full ${depth.targetPages}-page business plan for ${req.businessName}.

${req.contextBlock}

APPLICANT INPUT:
- Business: ${req.businessName}
- Funding requested: ${req.requestedAmountLabel || 'Not specified'}
- Stated purpose: ${req.purpose || 'General business growth'}

THE PLAN'S CHAPTERS (fixed — do not change):
${chapterMenu}

TASK — tailor the plan skeleton to THIS business:

1. "offerings": exactly ${counts.offerings} CORE products/services this business sells (real, specific names drawn from the context and purpose — e.g. "Township Last-Mile Delivery Service", not "Product 1"). Each with a one-sentence brief and 3 key points a funder would probe (pricing basis, capacity, target customer).

2. "models": exactly ${counts.models} plausible business models for this business (e.g. direct sales, subscription, social enterprise, franchise, partnership, sponsorship, hybrid). Mark exactly one "recommended": true — the strongest for this business and funder. Each with a one-sentence brief.

3. "personas": exactly ${counts.personas} target customer/stakeholder segments (specific South African segments with a share percentage of the customer base summing to roughly 100). Each with a one-sentence brief.

4. "subsectionTailoring": for any of these subsections where a business-specific title is clearly better than the generic one, provide {poolId, title, brief}: industry_overview, market_size, competitor_analysis, marketing_overview, operations_plan, team_roles, risk_matrix, pre_launch, post_launch, jobs_impact, funder_alignment. Titles must stay professional (e.g. "The KwaZulu-Natal Township Retail Opportunity" not "Market Size"). Skip poolIds you have nothing better for.

5. "chapterSummaries": a 2-sentence opener summary for up to 8 of the chapters above (choose the most important for this business). Keyed by chapter id.

RULES: Ground everything in the context block. Where a fact is unknown, write a sensible direction with a [placeholder] rather than inventing precise numbers. Professional South African business English. R/ZAR formatting.
OUTPUT: JSON only via the provided schema.`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          offerings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                brief: { type: Type.STRING },
                keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['title', 'brief'],
            },
          },
          models: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                brief: { type: Type.STRING },
                recommended: { type: Type.BOOLEAN },
              },
              required: ['title', 'brief'],
            },
          },
          personas: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                sharePct: { type: Type.NUMBER },
                brief: { type: Type.STRING },
                keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['title', 'brief'],
            },
          },
          subsectionTailoring: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                poolId: { type: Type.STRING },
                title: { type: Type.STRING },
                brief: { type: Type.STRING },
              },
              required: ['poolId', 'title'],
            },
          },
          chapterSummaries: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                chapterId: { type: Type.STRING },
                summary: { type: Type.STRING },
              },
              required: ['chapterId', 'summary'],
            },
          },
        },
        required: ['offerings', 'models', 'personas'],
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
    if (start === -1 || end === -1) throw new Error('Tailoring response was not valid JSON');
    parsed = JSON.parse(text.substring(start, end + 1));
  }

  const tailoring: PlanTailoring = {
    offerings: (Array.isArray(parsed.offerings) ? parsed.offerings : [])
      .filter((o: any) => o && o.title)
      .slice(0, counts.offerings + 1)
      .map((o: any) => ({
        title: String(o.title),
        brief: String(o.brief || ''),
        keyPoints: Array.isArray(o.keyPoints) ? o.keyPoints.map(String).slice(0, 4) : [],
      })),
    models: (Array.isArray(parsed.models) ? parsed.models : [])
      .filter((m: any) => m && m.title)
      .slice(0, counts.models + 1)
      .map((m: any) => ({
        title: String(m.title),
        brief: String(m.brief || ''),
        recommended: Boolean(m.recommended),
      })),
    personas: (Array.isArray(parsed.personas) ? parsed.personas : [])
      .filter((p: any) => p && p.title)
      .slice(0, counts.personas + 1)
      .map((p: any) => ({
        title: String(p.title),
        sharePct: Number(p.sharePct) || 0,
        brief: String(p.brief || ''),
        keyPoints: Array.isArray(p.keyPoints) ? p.keyPoints.map(String).slice(0, 4) : [],
      })),
    subsectionTailoring: {},
    chapterSummaries: {},
  };

  // Safety: guarantee one recommended model and non-empty families.
  if (tailoring.models.length && !tailoring.models.some((m) => m.recommended)) {
    tailoring.models[0].recommended = true;
  }
  if (!tailoring.models.length) {
    tailoring.models = [
      { title: 'Direct Sales Model', brief: 'Sell directly to customers at a sustainable margin.', recommended: true },
      { title: 'Partnership Model', brief: 'Grow reach through local partners.', recommended: false },
      { title: 'Hybrid Model', brief: 'Blend direct sales with partnership distribution.', recommended: false },
    ];
  }
  if (!tailoring.offerings.length) {
    tailoring.offerings = [
      { title: 'Core Offering', brief: 'The primary product or service this business sells.', keyPoints: [] },
    ];
  }
  if (!tailoring.personas.length) {
    tailoring.personas = [
      { title: 'Primary Customers', sharePct: 60, brief: 'The main paying customer base.', keyPoints: [] },
      { title: 'Secondary Customers', sharePct: 40, brief: 'A smaller adjacent segment.', keyPoints: [] },
    ];
  }

  for (const t of Array.isArray(parsed.subsectionTailoring) ? parsed.subsectionTailoring : []) {
    if (t && t.poolId && t.title) {
      tailoring.subsectionTailoring[String(t.poolId)] = { title: String(t.title), brief: String(t.brief || '') };
    }
  }
  for (const c of Array.isArray(parsed.chapterSummaries) ? parsed.chapterSummaries : []) {
    if (c && c.chapterId && c.summary) {
      tailoring.chapterSummaries[String(c.chapterId)] = String(c.summary);
    }
  }

  return tailoring;
}

// ─── Stage 0: skeleton assembly (deterministic) ──────────────────────────────

function makeSubsection(
  tpl: SubsectionTemplate,
  targetWords: number,
  tailoring: PlanTailoring,
  opts: { optional?: boolean } = {}
): PlanSubsection {
  const t = tailoring.subsectionTailoring[tpl.poolId];
  return {
    id: newId('sub'),
    title: t?.title || tpl.title,
    brief: t?.brief || tpl.brief,
    recipe: tpl.recipe,
    targetWords,
    status: 'outline',
    blocks: [],
    optional: opts.optional ?? tpl.optional,
    poolId: tpl.poolId,
  };
}

/** Persona subsection built from a tailoring persona. */
function personaSubsection(
  persona: PlanTailoring['personas'][number],
  targetWords: number
): PlanSubsection {
  const share = persona.sharePct > 0 ? ` (≈${Math.round(persona.sharePct)}% of the customer base)` : '';
  return {
    id: newId('sub'),
    title: persona.title + (persona.sharePct > 0 ? ` — ${Math.round(persona.sharePct)}%` : ''),
    brief: persona.brief || `Who this segment is, what they need, and how the business reaches them${share}.`,
    recipe: [
      '1 opening paragraph (60–90 words) introducing the segment.',
      `Then ONE kv block titled "Profile — ${persona.title}" with rows covering who they are, income or budget reality, and where they are found.`,
      'Then ONE twoCol block (left: "Frustrations", right: "Goals").',
      'Then ONE twoCol block (left: "Preferences", right: "Behavioural considerations & where to reach them").',
      persona.keyPoints.length ? `Key points that must be woven in: ${persona.keyPoints.join('; ')}.` : '',
    ].filter(Boolean).join(' '),
    targetWords,
    status: 'outline',
    blocks: [],
    poolId: `persona:${persona.title}`,
  };
}

/** Offering subsection built from a tailoring offering. */
function offeringSubsection(
  offering: PlanTailoring['offerings'][number],
  targetWords: number
): PlanSubsection {
  return {
    id: newId('sub'),
    title: offering.title,
    brief: offering.brief || 'What this offering is, who buys it, how it is priced and delivered.',
    recipe: [
      '1 to 2 paragraphs (90–130 words each) describing the offering concretely: what it is, what it includes, how it is delivered.',
      'Then ONE twoCol block (left: "Advantages", right: "Challenges") — 3–4 full-sentence items per side.',
      'Then ONE kv block titled "Target audience & pricing" with rows: Primary customers / Pricing basis / Payment terms.',
      offering.keyPoints.length ? `Must cover: ${offering.keyPoints.join('; ')}.` : '',
    ].filter(Boolean).join(' '),
    targetWords,
    status: 'outline',
    blocks: [],
    poolId: `offering:${offering.title}`,
  };
}

/** Business-model subsection built from a tailoring model. */
function modelSubsection(
  model: PlanTailoring['models'][number],
  targetWords: number,
  isRecommended: boolean
): PlanSubsection {
  return {
    id: newId('sub'),
    title: model.title + (isRecommended ? ' (Recommended)' : ''),
    brief: (isRecommended ? 'THE RECOMMENDED MODEL — argue why it is the strongest fit. ' : '') + (model.brief || ''),
    recipe: [
      '1 to 2 paragraphs (90–130 words each) explaining how this model would work for this business specifically.',
      'Then ONE twoCol block (left: "Advantages", right: "Challenges") — 3–4 full-sentence items per side.',
      isRecommended ? 'Then ONE callout: the one-sentence case for this model given the funder and the requested amount.' : '',
    ].filter(Boolean).join(' '),
    targetWords,
    status: 'outline',
    blocks: [],
    optional: !isRecommended,
    poolId: `model:${model.title}`,
  };
}

/**
 * Assembles the full document skeleton: chapters, subsections and word
 * budgets — deterministic given depth + tailoring. No AI calls.
 */
export function buildPlanSkeleton(
  req: PlanGenRequest,
  depth: DepthProfile,
  tailoring: PlanTailoring,
  meta: PlanDocument['meta'],
  ctx?: AutofillContext | null
): PlanDocument {
  const chapterIds = CHAPTER_CATALOG.map((c) => c.id);
  const budgets = allocateChapterBudgets(chapterIds, depth.targetWords, depth.category);

  const doc: PlanDocument = {
    id: newId('plan'),
    meta,
    chapters: [],
    templateId: 'institutional',
    depth: {
      targetPages: depth.targetPages,
      minPages: depth.minPages,
      maxPages: depth.maxPages,
      targetWords: depth.targetWords,
      label: depth.label,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  for (const tpl of CHAPTER_CATALOG) {
    const chapterBudget = budgets[tpl.id] || 2_000;
    const chapter: PlanChapter = {
      id: tpl.id,
      number: 0, // assigned below
      title: tpl.title,
      summary: tailoring.chapterSummaries[tpl.id] || tpl.summary,
      subsections: [],
    };

    // Required subsections.
    const required = tpl.required.map((s) => makeSubsection(s, 0, tailoring));
    // Pool subsections activated by depth (catalog order = priority).
    const take = poolTakeCount(tpl, depth.expansionRatio);
    const pool = tpl.pool.slice(0, take).map((s) => makeSubsection(s, 0, tailoring));

    // AI-shaped families.
    if (tpl.aiShaped === 'models') {
      const rec = tailoring.models.find((m) => m.recommended) || tailoring.models[0];
      const others = tailoring.models.filter((m) => m !== rec);
      const models = [...others.map((m) => modelSubsection(m, 0, false)), modelSubsection(rec, 0, true)];
      chapter.subsections.push(...required, ...models);
    } else if (tpl.aiShaped === 'personas') {
      const personas = tailoring.personas.map((p) => personaSubsection(p, 0));
      // Personas sit between the industry overview and the market size.
      const idx = required.findIndex((s) => s.poolId === 'market_size');
      if (idx === -1) chapter.subsections.push(...required, ...personas);
      else chapter.subsections.push(...required.slice(0, idx), ...personas, ...required.slice(idx));
      chapter.subsections.push(...pool);
    } else if (tpl.aiShaped === 'offerings') {
      const offerings = tailoring.offerings.map((o) => offeringSubsection(o, 0));
      // Offerings lead the chapter.
      chapter.subsections.push(...offerings, ...required, ...pool);
    } else {
      chapter.subsections.push(...required, ...pool);
    }

    // Deterministic document checklist (regulatory_compliance chapter).
    if (tpl.id === 'regulatory_compliance' && ctx) {
      chapter.subsections.push(buildDocumentChecklistSubsection(ctx));
    }

    // Deterministic use-of-funds (financial_plan chapter): when the user has
    // a real costed funding-needs register, the itemised table is built in
    // code from those figures — never AI-estimated. It REPLACES the
    // AI-written funding_plan subsection at the same position.
    if (tpl.id === 'financial_plan' && req.fundingNeedsSummary?.count) {
      const useOfFunds = buildUseOfFundsSubsection(
        req.fundingNeedsSummary,
        req.requestedAmountRand || 0,
        req.requestedAmountLabel
      );
      if (useOfFunds) {
        let replaced = false;
        chapter.subsections = chapter.subsections.map((s) => {
          if (s.poolId === 'funding_plan' && !s.deterministic && !replaced) {
            replaced = true;
            return useOfFunds;
          }
          return s;
        });
        if (!replaced) {
          // No AI funding_plan present (user dropped it?) — still insert the
          // real-figures section at the head of the chapter's required block.
          const firstOptional = chapter.subsections.findIndex((s) => s.optional);
          if (firstOptional === -1) chapter.subsections.push(useOfFunds);
          else chapter.subsections.splice(firstOptional, 0, useOfFunds);
        }
      }
    }

    // Assign word budgets: deterministic sections get none; the rest split
    // the chapter budget (clamped per subsection).
    const aiSubs = chapter.subsections.filter((s) => !s.deterministic);
    const perSub = splitBudgetAcrossSubsections(chapterBudget, aiSubs.length);
    aiSubs.forEach((s, i) => { s.targetWords = perSub[i]; });

    doc.chapters.push(chapter);
  }

  doc.chapters.forEach((c, i) => { c.number = i + 1; });
  return doc;
}

// ─── Deterministic document checklist ────────────────────────────────────────

/** Compliance checklist built from the REAL eligibility context — never AI. */
export function buildDocumentChecklistSubsection(ctx: AutofillContext): PlanSubsection {
  const docStatus = (docName: string): string =>
    ctx.matchedDocuments.some((m) => m.toLowerCase().includes(docName.toLowerCase().slice(0, 8))) ? 'In vault' : 'To upload';

  const rows: string[][] = ctx.requiredDocuments.map((doc) => [doc, docStatus(doc), 'Attached to this application']);
  if (!rows.length) {
    rows.push(['Business plan (this document)', 'Attached', '—']);
  }

  const ruleRows: string[][] = (ctx.eligibility.rules || [])
    .filter((r) => r.verdict !== 'unknown')
    .map((r) => [r.label, r.verdict === 'pass' ? 'Meets requirement' : 'Does not meet', r.reason || '']);

  const allRows = [...rows, ...ruleRows.map((r) => [r[0], r[1], r[2]])];

  const summaryParagraph = ctx.eligibility.eligible
    ? `This application meets the hard eligibility requirements that could be verified for ${ctx.opportunity.programme_name || 'this programme'}. The table below lists every document the funder requires and its status in the applicant's document vault.`
    : `The applicant has noted the eligibility gaps below and is addressing them alongside this submission. The table lists every document the funder requires, its status in the applicant's vault, and each eligibility rule with its current status.`;

  const blocks: PlanBlock[] = [
    { id: newId('pb'), type: 'paragraph', text: summaryParagraph },
    {
      id: newId('pb'),
      type: 'table',
      table: {
        caption: `Document & eligibility checklist — ${ctx.opportunity.issuer_name || 'Funder'}`,
        columns: ['Requirement', 'Status', 'Notes'],
        rows: allRows,
      },
    },
    {
      id: newId('pb'),
      type: 'stats',
      stats: [
        { value: String(ctx.matchedDocuments.length), label: 'Documents in vault' },
        { value: String(ctx.missingDocuments.length), label: 'Still to upload' },
        { value: String((ctx.eligibility.rules || []).filter((r) => r.verdict === 'pass').length), label: 'Eligibility rules met' },
      ],
    },
  ];

  return {
    id: newId('sub'),
    title: 'Document & Eligibility Checklist',
    brief: 'Deterministic checklist generated from the funder\u2019s published requirements and the applicant\u2019s document vault.',
    recipe: '',
    targetWords: 0,
    status: 'filled',
    blocks,
    deterministic: true,
    poolId: 'document_checklist',
  };
}

// ─── Stage 1: fill one subsection ────────────────────────────────────────────

const BLOCK_TYPES_ENUM = [
  'paragraph', 'heading', 'bullets', 'twoCol', 'stats', 'table', 'swot', 'kv', 'chart', 'sources', 'callout',
];

function blockResponseSchema() {
  const stringList = { type: Type.ARRAY, items: { type: Type.STRING } };
  const colList = {
    type: Type.OBJECT,
    properties: { title: { type: Type.STRING }, items: stringList },
    required: ['title', 'items'],
  };
  const chartPoints = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: { label: { type: Type.STRING }, value: { type: Type.NUMBER } },
      required: ['label', 'value'],
    },
  };
  return {
    type: Type.OBJECT,
    properties: {
      blocks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: BLOCK_TYPES_ENUM },
            text: { type: Type.STRING },
            title: { type: Type.STRING },
            items: stringList,
            left: colList,
            right: colList,
            stats: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { value: { type: Type.STRING }, label: { type: Type.STRING } },
                required: ['value', 'label'],
              },
            },
            table: {
              type: Type.OBJECT,
              properties: {
                caption: { type: Type.STRING },
                columns: stringList,
                rows: { type: Type.ARRAY, items: stringList },
              },
              required: ['columns', 'rows'],
            },
            swot: {
              type: Type.OBJECT,
              properties: {
                strengths: stringList,
                weaknesses: stringList,
                opportunities: stringList,
                threats: stringList,
              },
            },
            kv: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                rows: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: { k: { type: Type.STRING }, v: { type: Type.STRING } },
                    required: ['k', 'v'],
                  },
                },
              },
            },
            chart: {
              type: Type.OBJECT,
              properties: {
                kind: { type: Type.STRING, enum: ['bar', 'line', 'donut'] },
                title: { type: Type.STRING },
                points: chartPoints,
                points2: chartPoints,
                seriesLabel: { type: Type.STRING },
                seriesLabel2: { type: Type.STRING },
              },
              required: ['points'],
            },
          },
          required: ['type'],
        },
      },
    },
    required: ['blocks'],
  };
}

export interface FillExtras {
  /** Extra instruction from the user (rewrite). Highest priority. */
  instruction?: string;
  /** Titles of sibling subsections already written (avoid repetition). */
  writtenSiblingTitles?: string[];
  /** Key claims from earlier sections the writer must stay consistent with. */
  keyClaims?: string[];
  /** Set when this is a corrective expansion pass. */
  expandBy?: number;
}

function buildFillPrompt(
  sub: PlanSubsection,
  chapter: PlanChapter,
  req: PlanGenRequest,
  extras: FillExtras
): string {
  const paragraphs = Math.max(2, Math.round(sub.targetWords / 130));
  const perPara = Math.round(sub.targetWords / paragraphs);
  const needsBlock =
    req.fundingNeedsSummary?.count
      ? `\n${fundingNeedsContextBlock(req.fundingNeedsSummary, req.requestedAmountLabel)}\n`
      : '';

  return `You are a South African business consultant writing ONE subsection of a full business plan for ${req.businessName}. This subsection will be read by a funder's credit committee.

${req.contextBlock}
${needsBlock}
APPLICANT INPUT:
- Business: ${req.businessName}
- Funding requested: ${req.requestedAmountLabel || 'Not specified'}
- Stated purpose: ${req.purpose || 'General business growth'}

WHERE THIS SITS IN THE DOCUMENT:
- Chapter ${chapter.number}: ${chapter.title} — ${chapter.summary}
- Subsection: ${sub.title}
${extras.writtenSiblingTitles?.length ? `- Already written in this chapter (do NOT repeat their content): ${extras.writtenSiblingTitles.join('; ')}` : ''}
${extras.keyClaims?.length ? `\nKEY CLAIMS ALREADY MADE EARLIER IN THE PLAN (stay numerically consistent with these):\n${extras.keyClaims.map((c) => `- ${c}`).join('\n')}` : ''}

WHAT THIS SUBSECTION MUST ARGUE:
${sub.brief}

SHAPE CONTRACT (follow exactly):
${sub.recipe}

LENGTH CONTRACT: approximately ${sub.targetWords} words of prose. Plan roughly ${paragraphs} paragraphs of ${Math.max(60, perPara - 15)}–${perPara + 20} words each, plus the structured blocks the shape contract asks for.
${extras.expandBy ? `\nIMPORTANT: your previous attempt was too short. Expand by at least ${extras.expandBy} words — deepen the analysis, add concrete South African specifics, do not pad with repetition.` : ''}

STYLE: Professional and sober business plan prose — the register of a bank credit memorandum. No marketing hype, no exclamation marks, no emoji. Specific over generic: name provinces, Rand amounts, timeframes. South African English and R/ZAR formatting (e.g. R1.2m or R500 000). Where a fact is genuinely unknown, write a sensible [placeholder in square brackets] — never invent precise figures that contradict the context. Tables must be internally consistent (columns that should sum, sum).

OUTPUT: JSON only via the provided schema — an array of blocks in document order, using exactly the block types the shape contract names. No markdown fences.`;
}

async function callFill(sub: PlanSubsection, chapter: PlanChapter, req: PlanGenRequest, extras: FillExtras): Promise<PlanBlock[]> {
  const ai = await createGeminiClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildFillPrompt(sub, chapter, req, extras),
    config: {
      responseMimeType: 'application/json',
      responseSchema: blockResponseSchema(),
    },
  });

  let parsed: any;
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch {
    const text = (response.text || '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Fill response was not valid JSON');
    parsed = JSON.parse(text.substring(start, end + 1));
  }
  return coerceBlocks(parsed.blocks);
}

/**
 * Fills one subsection with budget enforcement:
 *   ≥ 78% of target  → accept
 *   45–78%           → one corrective expansion pass, then accept
 *   < 45%            → one retry, then accept whatever we have
 */
export async function fillPlanSubsection(
  sub: PlanSubsection,
  chapter: PlanChapter,
  req: PlanGenRequest,
  extras: FillExtras = {}
): Promise<PlanSubsection> {
  let blocks = await callFill(sub, chapter, req, extras);
  let words = blocks.reduce((n, b) => {
    // Import-free word count for prose-ish blocks (mirror of schema logic).
    const wc = (t?: string) => (t ? t.trim().split(/\s+/).filter(Boolean).length : 0);
    let w = 0;
    if (b.type === 'paragraph' || b.type === 'heading' || b.type === 'callout') w = wc(b.text);
    else if (b.type === 'bullets' || b.type === 'sources') w = wc(b.title) + (b.items || []).reduce((n2, i) => n2 + wc(i), 0);
    else if (b.type === 'twoCol') w = wc(b.left?.title) + wc(b.right?.title) + (b.left?.items || []).reduce((n2, i) => n2 + wc(i), 0) + (b.right?.items || []).reduce((n2, i) => n2 + wc(i), 0);
    else if (b.type === 'swot') w = ['strengths', 'weaknesses', 'opportunities', 'threats'].reduce((n2, k) => n2 + (b.swot?.[k as 'strengths'] || []).reduce((n3, i) => n3 + wc(i), 0), 0);
    else if (b.type === 'kv') w = (b.kv?.rows || []).reduce((n2, r) => n2 + wc(r.k) + wc(r.v), 0);
    return n + w;
  }, 0);

  const target = Math.max(1, sub.targetWords);
  const ratio = words / target;

  if (ratio < 0.78) {
    const deficit = Math.max(180, Math.round(target - words));
    try {
      const expanded = await callFill(sub, chapter, req, { ...extras, expandBy: deficit });
      const expandedWords = subsectionWordCount({ ...sub, blocks: expanded });
      if (expanded.length && expandedWords >= words) {
        blocks = expanded;
        words = expandedWords;
      }
    } catch {
      // Keep the first attempt.
    }
  }

  if (!blocks.length) {
    throw new Error(`The AI returned no content for "${sub.title}".`);
  }

  return { ...sub, blocks, status: 'filled' };
}

// ─── Key-claim tracking (consistency across 50+ calls) ──────────────────────

/** Pulls the headline claims from the executive summary once written. */
export function extractKeyClaims(doc: PlanDocument): string[] {
  const claims: string[] = [];
  const exec = doc.chapters.find((c) => c.id === 'executive_summary');
  if (!exec) return claims;
  for (const s of exec.subsections) {
    for (const b of s.blocks) {
      if (b.type === 'stats' && b.stats) {
        for (const st of b.stats) claims.push(`${st.label}: ${st.value}`);
      } else if (b.type === 'callout' && b.text) {
        claims.push(b.text.slice(0, 220));
      } else if (b.type === 'paragraph' && b.text && claims.length < 3) {
        claims.push(b.text.slice(0, 220));
      }
    }
  }
  return claims.slice(0, 8);
}

// ─── Checkpointing (resume a long generation) ────────────────────────────────

const CHECKPOINT_KEY = 'stacfund_bp_checkpoint_v1';

export interface PlanCheckpoint {
  doc: PlanDocument;
  req: PlanGenRequest;
  savedAt: number;
}

export function savePlanCheckpoint(doc: PlanDocument, req: PlanGenRequest): void {
  try {
    const cp: PlanCheckpoint = { doc, req, savedAt: Date.now() };
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(cp));
  } catch (e) {
    console.warn('[planGenerator] checkpoint save failed (likely size)', e);
  }
}

export function loadPlanCheckpoint(): PlanCheckpoint | null {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    const cp = JSON.parse(raw) as PlanCheckpoint;
    if (!cp?.doc?.chapters?.length) return null;
    return cp;
  } catch {
    return null;
  }
}

export function clearPlanCheckpoint(): void {
  try {
    localStorage.removeItem(CHECKPOINT_KEY);
  } catch { /* ignore */ }
}

/** Rough token estimate for the quota warning in the UI. */
export function estimatePlanTokens(targetWords: number): number {
  // Prompt overhead per call (~1.4k tokens) × ~55 calls, plus output tokens
  // (×1.35 JSON overhead) — a deliberate over-estimate so users are warned early.
  return Math.round(targetWords * 1.35 * 1.35 + 55 * 1400);
}
