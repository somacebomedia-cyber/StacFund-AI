// services/businessPlan/planSchema.ts
/**
 * StacFund — Long-form Business Plan document schema (Venturekit-class)
 * =====================================================================
 * The typed data model for full 70–120 page funder-ready business plans.
 *
 * This is the long-form sibling of services/proposal/proposalSchema.ts:
 *   - Proposal Studio  → short, designed funding PROPOSALS (8–15 pages)
 *   - Business Plan Studio → full BUSINESS PLANS (70–120 pages), text-first,
 *     professional and sober: no large images, no decorative graphics —
 *     only text, tables, stat chips and minimal charts.
 *
 * Model: PlanDocument → chapters → subsections → typed content blocks.
 * The AI fills one subsection per call with a WORD BUDGET, so total length
 * is engineered deterministically (planDepth.ts) rather than hoped for.
 */

// ─── Content blocks ──────────────────────────────────────────────────────────

export type PlanBlockType =
  | 'paragraph'    // flowing prose
  | 'heading'      // minor heading inside a subsection
  | 'bullets'      // single bullet list (with optional title)
  | 'twoCol'       // two-column list pair, e.g. Advantages | Challenges
  | 'stats'        // row of bordered stat chips (value + label)
  | 'table'        // clean data table with caption
  | 'swot'         // 2×2 SWOT grid
  | 'kv'           // key/value profile rows (e.g. audience persona)
  | 'chart'        // minimal SVG chart (bar / line / donut)
  | 'sources'      // small italic source list
  | 'callout';     // accent-bar highlight box

export interface PlanStat {
  value: string;   // short display value, e.g. "R1.2m" / "14" / "62%"
  label: string;   // what it means
}

export interface PlanColList {
  title: string;
  items: string[];
}

export interface PlanTable {
  caption?: string;
  columns: string[];
  rows: string[][];
}

export interface PlanSwot {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface PlanChartPoint {
  label: string;
  value: number;
}

export interface PlanChart {
  kind: 'bar' | 'line' | 'donut';
  title?: string;
  points: PlanChartPoint[];
  /** Optional secondary series for line charts (e.g. expenses vs revenue). */
  points2?: PlanChartPoint[];
  seriesLabel?: string;
  seriesLabel2?: string;
}

export interface PlanKv {
  title?: string;
  rows: { k: string; v: string }[];
}

export interface PlanBlock {
  id: string;
  type: PlanBlockType;
  text?: string;                       // paragraph | heading | callout
  title?: string;                      // bullets | kv | chart
  items?: string[];                    // bullets | sources
  left?: PlanColList;                  // twoCol
  right?: PlanColList;
  stats?: PlanStat[];                  // stats
  table?: PlanTable;                   // table
  swot?: PlanSwot;                     // swot
  kv?: PlanKv;                         // kv
  chart?: PlanChart;                   // chart
}

// ─── Subsections & chapters ──────────────────────────────────────────────────

export type SubsectionStatus = 'outline' | 'filled' | 'failed';

export interface PlanSubsection {
  id: string;
  title: string;
  /** What this subsection must argue — one or two sentences. */
  brief: string;
  /** Deterministic guidance for the fill call: which blocks to emit. */
  recipe: string;
  /** Word budget for this subsection (excludes table/kv text). */
  targetWords: number;
  status: SubsectionStatus;
  blocks: PlanBlock[];
  /** True when built in code (compliance checklist, use of funds) — no AI. */
  deterministic?: boolean;
  /** Droppable without hurting the plan when the document runs past 120 pages. */
  optional?: boolean;
  /** Catalog pool id — prevents duplicate picks during deepen passes. */
  poolId?: string;
}

export interface PlanChapter {
  id: string;
  /** 1-based chapter number shown on the chapter opener page. */
  number: number;
  title: string;
  /** One-paragraph chapter summary shown on the opener page. */
  summary: string;
  subsections: PlanSubsection[];
}

// ─── Document meta ───────────────────────────────────────────────────────────

export interface PlanMeta {
  businessName: string;
  planTitle: string;                 // e.g. "Business Plan"
  tagline: string;
  preparedFor: string;               // funder / programme
  preparedBy: string;
  contactEmail: string;
  contactPhone: string;
  contactWebsite: string;
  contactAddress: string;
  dateLabel: string;
  requestedAmountLabel: string;
}

export interface PlanDepthInfo {
  /** Target page count the engine steers toward. */
  targetPages: number;
  /** Acceptable band — the deepen loop expands until min is met. */
  minPages: number;
  maxPages: number;
  /** Total word budget for content (excludes structural pages). */
  targetWords: number;
  /** Human label, e.g. "Comprehensive". */
  label: string;
}

export interface PlanDocument {
  id: string;
  meta: PlanMeta;
  chapters: PlanChapter[];
  templateId: string;               // 'institutional'
  accentOverride?: string;
  depth: PlanDepthInfo;
  createdAt?: number;
  updatedAt?: number;
}

// ─── Word counting ───────────────────────────────────────────────────────────

function countWords(text: string | undefined): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Prose words in a block — tables/kv/stats/charts excluded (they render compactly). */
export function blockWordCount(b: PlanBlock): number {
  switch (b.type) {
    case 'paragraph':
    case 'heading':
    case 'callout':
      return countWords(b.text);
    case 'bullets':
      return countWords(b.title) + (b.items || []).reduce((n, i) => n + countWords(i), 0);
    case 'twoCol':
      return (
        countWords(b.left?.title) + countWords(b.right?.title) +
        (b.left?.items || []).reduce((n, i) => n + countWords(i), 0) +
        (b.right?.items || []).reduce((n, i) => n + countWords(i), 0)
      );
    case 'swot':
      return (['strengths', 'weaknesses', 'opportunities', 'threats'] as const)
        .reduce((n, k) => n + (b.swot?.[k] || []).reduce((m, i) => m + countWords(i), 0), 0);
    case 'kv':
      return (b.kv?.rows || []).reduce((n, r) => n + countWords(r.k) + countWords(r.v), 0);
    default:
      return 0; // stats | table | chart | sources | unknown
  }
}

export function subsectionWordCount(s: PlanSubsection): number {
  return s.blocks.reduce((n, b) => n + blockWordCount(b), 0);
}

export function chapterWordCount(c: PlanChapter): number {
  return c.subsections.reduce((n, s) => n + subsectionWordCount(s), 0);
}

export function documentWordCount(doc: PlanDocument): number {
  return doc.chapters.reduce((n, c) => n + chapterWordCount(c), 0);
}

/** Rough page estimate used for live progress while generating. */
export function estimatePageCount(doc: PlanDocument, structuralPages: number): number {
  // Effective prose density per content page (calibrated against the
  // institutional template: 15.5px serif, 642px text column).
  const WORDS_PER_PAGE = 360;
  const words = documentWordCount(doc);
  // Tables/stats/kv take vertical space without many words — count them as
  // a fraction of a page each, capped, so the estimate tracks reality.
  let denseBlocks = 0;
  for (const c of doc.chapters) for (const s of c.subsections)
    for (const b of s.blocks) if (b.type === 'table' || b.type === 'kv' || b.type === 'chart' || b.type === 'stats' || b.type === 'swot') denseBlocks++;
  const densePages = Math.min(14, denseBlocks * 0.22);
  return Math.round(structuralPages + densePages + words / WORDS_PER_PAGE);
}

// ─── Ids & factories ─────────────────────────────────────────────────────────

let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

export function newBlockId(): string {
  return newId('pb');
}

export function createPlanMeta(partial: Partial<PlanMeta> = {}): PlanMeta {
  const now = new Date();
  return {
    businessName: partial.businessName || 'Your Business',
    planTitle: partial.planTitle || 'Business Plan',
    tagline: partial.tagline || '',
    preparedFor: partial.preparedFor || 'The Review Committee',
    preparedBy: partial.preparedBy || '',
    contactEmail: partial.contactEmail || '',
    contactPhone: partial.contactPhone || '',
    contactWebsite: partial.contactWebsite || '',
    contactAddress: partial.contactAddress || '',
    dateLabel: partial.dateLabel || now.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }),
    requestedAmountLabel: partial.requestedAmountLabel || '',
  };
}

// ─── Coercion of AI JSON → typed blocks ──────────────────────────────────────

/**
 * The Gemini structured-output schema cannot express discriminated unions,
 * so fills return "blockish" objects (type + optional everything). This
 * coerces and sanitises them into real PlanBlocks, dropping junk.
 */
export function coerceBlocks(raw: unknown): PlanBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanBlock[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const type = String(o.type || '') as PlanBlockType;
    const b: PlanBlock = { id: newBlockId(), type };
    const str = (v: unknown): string | undefined =>
      typeof v === 'string' && v.trim() ? v.trim() : undefined;
    const strArr = (v: unknown): string[] | undefined =>
      Array.isArray(v) && v.length ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : undefined;
    const colList = (v: unknown): PlanColList | undefined => {
      if (!v || typeof v !== 'object') return undefined;
      const c = v as Record<string, unknown>;
      const items = strArr(c.items);
      if (!items || !items.length) return undefined;
      return { title: String(c.title || ''), items };
    };

    switch (type) {
      case 'paragraph':
      case 'heading':
      case 'callout':
        b.text = str(o.text);
        if (!b.text) continue;
        break;
      case 'bullets': {
        b.title = str(o.title);
        b.items = strArr(o.items);
        if (!b.items) continue;
        break;
      }
      case 'sources': {
        b.items = strArr(o.items);
        if (!b.items) continue;
        break;
      }
      case 'twoCol': {
        b.left = colList(o.left);
        b.right = colList(o.right);
        if (!b.left && !b.right) continue;
        break;
      }
      case 'stats': {
        const stats = Array.isArray(o.stats)
          ? o.stats
              .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
              .map((s) => ({ value: String(s.value ?? '').trim(), label: String(s.label ?? '').trim() }))
              .filter((s) => s.value)
          : [];
        if (!stats.length) continue;
        b.stats = stats.slice(0, 4);
        break;
      }
      case 'table': {
        const t = o.table as Record<string, unknown> | undefined;
        const columns = strArr(t?.columns);
        const rows = Array.isArray(t?.rows)
          ? (t!.rows as unknown[])
              .filter((r): r is unknown[] => Array.isArray(r))
              .map((r) => r.map((c) => String(c ?? '').trim()))
              .filter((r) => r.length)
          : [];
        if (!columns || !rows.length) continue;
        b.table = { caption: str(t?.caption), columns, rows };
        break;
      }
      case 'swot': {
        const w = o.swot as Record<string, unknown> | undefined;
        const swot: PlanSwot = {
          strengths: strArr(w?.strengths) || [],
          weaknesses: strArr(w?.weaknesses) || [],
          opportunities: strArr(w?.opportunities) || [],
          threats: strArr(w?.threats) || [],
        };
        if (!swot.strengths.length && !swot.weaknesses.length && !swot.opportunities.length && !swot.threats.length) continue;
        b.swot = swot;
        break;
      }
      case 'kv': {
        const k = o.kv as Record<string, unknown> | undefined;
        const rows = Array.isArray(k?.rows)
          ? (k!.rows as unknown[])
              .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
              .map((r) => ({ k: String(r.k ?? r.key ?? '').trim(), v: String(r.v ?? r.value ?? '').trim() }))
              .filter((r) => r.k)
          : [];
        if (!rows.length) continue;
        b.kv = { title: str(k?.title), rows };
        break;
      }
      case 'chart': {
        const c = o.chart as Record<string, unknown> | undefined;
        const kind = (String(c?.kind || 'bar') as PlanChart['kind']);
        const pts = (arr: unknown) =>
          Array.isArray(arr)
            ? (arr as unknown[])
                .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
                .map((p) => ({ label: String(p.label ?? '').trim(), value: Number(p.value) || 0 }))
                .filter((p) => p.label)
            : [];
        const points = pts(c?.points);
        if (!points.length) continue;
        const points2 = pts(c?.points2);
        b.chart = {
          kind: kind === 'line' || kind === 'donut' ? kind : 'bar',
          title: str(c?.title),
          points,
          ...(points2.length ? { points2, seriesLabel: str(c?.seriesLabel), seriesLabel2: str(c?.seriesLabel2) } : {}),
        };
        break;
      }
      default:
        continue; // unknown block type — drop
    }
    out.push(b);
  }
  return out;
}
