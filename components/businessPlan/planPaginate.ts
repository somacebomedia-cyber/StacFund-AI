// components/businessPlan/planPaginate.ts
/**
 * StacFund — Exact pagination engine for the long-form business plan
 * =================================================================
 * Turns the flowing document (chapters → subsections → blocks) into exact
 * A4 pages, so that:
 *
 *   - the on-screen preview IS the PDF (Canva-grade WYSIWYG),
 *   - the Table of Contents shows REAL page numbers,
 *   - every page footer shows "X of N".
 *
 * How: the Studio renders every block once into a hidden measuring layer at
 * the exact content width; this engine reads those heights and packs blocks
 * onto pages with Venturekit-style rules:
 *
 *   - cover            → its own page (no header/footer)
 *   - TOC              → fixed-height rows, deterministic page count
 *   - chapter opener   → its own page
 *   - subsection       → starts a new page; heading keeps with first block
 *   - blocks           → never split (except over-tall tables, which split
 *                        by rows with the header repeated)
 */
import type { PlanBlock, PlanDocument } from '../../services/businessPlan/planSchema';
import { newBlockId } from '../../services/businessPlan/planSchema';

// ─── Geometry (A4 @ 96dpi, matched by PlanBlocks page frames) ────────────────

export const PAGE_W = 794;
export const PAGE_H = 1123;
export const MARGIN_X = 76;
export const CONTENT_W = PAGE_W - MARGIN_X * 2;     // 642
export const CONTENT_TOP = 104;
export const CONTENT_BOTTOM = 1042;
export const CONTENT_H = CONTENT_BOTTOM - CONTENT_TOP; // 938
/** Vertical gap between blocks (must match PlanBlockView marginBottom). */
export const BLOCK_GAP = 16;
/** Height reserved by the subsection title block on its first page. */
export const SUBSECTION_TITLE_H = 84;
/** Fixed row height for TOC rows (chapter rows are double). */
export const TOC_ROW_H = 27;
export const TOC_CHAPTER_ROW_H = 42;
const TOC_TITLE_H = 120;
/** Rows per TOC page (conservative so the deterministic count never overflows). */
export const TOC_ROWS_PER_PAGE = Math.floor((CONTENT_H - TOC_TITLE_H - 40) / TOC_ROW_H);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlanPage {
  index: number;            // 0-based final position
  pageNo: number;           // 1-based (cover = 1)
  kind: 'cover' | 'toc' | 'chapter' | 'content';
  chapterId?: string;
  subsectionId?: string;
  blocks: PlanBlock[];
  /** Subsection title shown at the top of the subsection's first page. */
  subsectionTitle?: string;
  /** True when this subsection has not been generated yet (placeholder). */
  pending?: boolean;
  /** TOC slice (for kind === 'toc'). */
  tocRows?: TocEntryRow[];
}

export interface TocEntryRow {
  label: string;
  pageNo: number;
  level: 'chapter' | 'subsection';
  chapterNumber?: number;
}

export interface PaginatedPlan {
  pages: PlanPage[];
  totalPages: number;
  /** chapterId → first page number. */
  chapterFirstPages: Record<string, number>;
  /** Estimated pages when every pending subsection is filled. */
  projectedTotalPages: number;
}

// ─── Table splitting (the only blocks allowed to split) ─────────────────────

function splitTableBlock(block: PlanBlock, fullH: number): PlanBlock[] {
  const table = block.table!;
  const rows = table.rows;
  const headerH = 44; // measured against the institutional table style
  const rowH = rows.length ? Math.max(20, (fullH - headerH) / rows.length) : 24;
  const budget = CONTENT_H - SUBSECTION_TITLE_H - 60; // room on a fresh page

  const parts: PlanBlock[] = [];
  let start = 0;
  let partNo = 1;
  while (start < rows.length) {
    // First chunk shares the page with the subsection title + intro; later
    // chunks get the full page.
    const available = parts.length === 0 ? budget : CONTENT_H - 40;
    let count = Math.max(1, Math.floor(available / rowH));
    const slice = rows.slice(start, start + count);
    parts.push({
      ...block,
      id: `${block.id}__sp${partNo}`,
      table: {
        ...table,
        caption: partNo > 1 ? `${table.caption || 'Table'} (continued)` : table.caption,
        rows: slice,
      },
    });
    start += slice.length;
    partNo++;
    // Guard: if a single row is taller than a page, drop the rest rather
    // than loop forever (cannot happen with sane content).
    if (count <= 0) break;
  }
  return parts;
}

// ─── Main pagination ─────────────────────────────────────────────────────────

/**
 * @param doc            the document (may be partially filled)
 * @param heightOf       measured px height of a block at CONTENT_W (content
 *                       only — the engine adds BLOCK_GAP itself)
 */
export function paginatePlan(
  doc: PlanDocument,
  heightOf: (b: PlanBlock) => number
): PaginatedPlan {
  type Item =
    | { t: 'chapterOpener'; chapterId: string }
    | { t: 'subHead'; chapterId: string; subId: string; title: string }
    | { t: 'block'; chapterId: string; subId: string; block: PlanBlock; pending?: boolean };

  // 1. Flatten the document into a flow of items.
  const items: Item[] = [];
  for (const ch of doc.chapters) {
    items.push({ t: 'chapterOpener', chapterId: ch.id });
    for (const sub of ch.subsections) {
      items.push({ t: 'subHead', chapterId: ch.id, subId: sub.id, title: sub.title });
      if (sub.status === 'filled' && sub.blocks.length) {
        for (const b of sub.blocks) items.push({ t: 'block', chapterId: ch.id, subId: sub.id, block: b });
      } else {
        // Pending subsection: emit one placeholder item so the live preview
        // grows as generation progresses.
        items.push({ t: 'block', chapterId: ch.id, subId: sub.id, block: { id: `pending_${sub.id}`, type: 'paragraph' }, pending: true });
      }
    }
  }

  // 2. Pack onto pages.
  interface DraftPage {
    kind: 'chapter' | 'content';
    chapterId: string;
    subsectionId?: string;
    blocks: PlanBlock[];
    subsectionTitle?: string;
    pending?: boolean;
  }
  const draftPages: DraftPage[] = [];
  let cur: DraftPage | null = null;
  let curUsed = 0;

  const startPage = (p: DraftPage) => {
    draftPages.push(p);
    cur = p;
    curUsed = p.kind === 'chapter' ? CONTENT_H + 1 : 0; // chapter openers are always alone
  };

  for (const it of items) {
    if (it.t === 'chapterOpener') {
      startPage({ kind: 'chapter', chapterId: it.chapterId, blocks: [] });
      continue;
    }
    if (it.t === 'subHead') {
      // A new subsection always starts a fresh page.
      startPage({
        kind: 'content',
        chapterId: it.chapterId,
        subsectionId: it.subId,
        subsectionTitle: it.title,
        blocks: [],
      });
      curUsed = SUBSECTION_TITLE_H;
      continue;
    }
    // Block item.
    if (it.pending) {
      if (cur && cur.kind === 'content' && curUsed + 120 <= CONTENT_H) {
        cur.blocks.push({ id: it.block.id, type: 'paragraph', text: '' });
        cur.pending = true;
        curUsed += 120;
      } else {
        startPage({
          kind: 'content', chapterId: it.chapterId, subsectionId: it.subId,
          subsectionTitle: '', blocks: [], pending: true,
        });
        curUsed = SUBSECTION_TITLE_H + 120;
        cur.blocks.push({ id: it.block.id, type: 'paragraph', text: '' });
      }
      continue;
    }

    // Blocks to place (possibly several when an over-tall table is split).
    let blockList: PlanBlock[] = [it.block];
    let partHeights: number[] | null = null;

    if (it.block.type === 'table' && it.block.table) {
      const h = heightOf(it.block);
      if (h > CONTENT_H - SUBSECTION_TITLE_H - 40) {
        blockList = splitTableBlock(it.block, h);
        // Split parts are synthetic (not in the measure layer) — compute
        // their heights analytically from the same row-height estimate.
        const headerH = 44;
        const rowH = it.block.table.rows.length
          ? Math.max(20, (h - headerH) / it.block.table.rows.length)
          : 24;
        partHeights = blockList.map(
          (b) => headerH + (b.table?.rows.length || 0) * rowH + 30 // + caption/padding
        );
      }
    }

    const firstH = (partHeights ? partHeights[0] : heightOf(blockList[0])) + BLOCK_GAP;
    const fits = cur && cur.kind === 'content' && !cur.pending && curUsed + firstH <= CONTENT_H;
    if (!fits) {
      // Continuation page of the same subsection carries no repeated title.
      const isContinuation =
        draftPages.length > 0 &&
        draftPages[draftPages.length - 1].subsectionId === it.subId &&
        draftPages[draftPages.length - 1].kind === 'content';
      startPage({
        kind: 'content',
        chapterId: it.chapterId,
        subsectionId: it.subId,
        blocks: [],
      });
      curUsed = isContinuation ? 0 : SUBSECTION_TITLE_H;
    }
    blockList.forEach((b, bi) => {
      const bh = (partHeights ? partHeights[bi] : heightOf(b)) + BLOCK_GAP;
      if (curUsed + bh > CONTENT_H && curUsed > (bi === 0 ? SUBSECTION_TITLE_H : 0)) {
        // Overflow onto a continuation page (title never repeats).
        startPage({ kind: 'content', chapterId: it.chapterId, subsectionId: it.subId, blocks: [] });
        curUsed = 0;
      }
      cur!.blocks.push(b);
      curUsed += bh;
    });
  }

  // 3. TOC rows (page numbers relative to content start; shifted below).
  const tocRows: TocEntryRow[] = [];
  const chapterFirstPages: Record<string, number> = {};
  const subsectionFirstPages: Record<string, number> = {};
  const contentStartIndex = 0; // draft pages come before cover/toc insertion
  draftPages.forEach((p, i) => {
    if (p.kind === 'chapter') chapterFirstPages[p.chapterId] = i - contentStartIndex;
    if (p.subsectionId && !(p.subsectionId in subsectionFirstPages)) {
      subsectionFirstPages[p.subsectionId] = i - contentStartIndex;
    }
  });

  for (const ch of doc.chapters) {
    const chPage = chapterFirstPages[ch.id] ?? 0;
    tocRows.push({ label: ch.title, pageNo: chPage, level: 'chapter', chapterNumber: ch.number });
    for (const sub of ch.subsections) {
      tocRows.push({ label: sub.title, pageNo: subsectionFirstPages[sub.id] ?? chPage, level: 'subsection' });
    }
  }

  // 4. Deterministic TOC page count.
  const tocPageCount = Math.max(1, Math.ceil(tocRows.length / Math.max(1, TOC_ROWS_PER_PAGE)));

  // 5. Assemble final pages: cover, TOC, content.
  const pages: PlanPage[] = [];
  pages.push({ index: 0, pageNo: 1, kind: 'cover', blocks: [] });

  const tocSliceStart: number[] = [];
  for (let i = 0; i < tocPageCount; i++) tocSliceStart.push(i * TOC_ROWS_PER_PAGE);
  tocSliceStart.forEach((start, i) => {
    pages.push({
      index: pages.length,
      pageNo: pages.length + 1,
      kind: 'toc',
      tocRows: tocRows.slice(start, start + TOC_ROWS_PER_PAGE),
      blocks: [],
    });
  });

  draftPages.forEach((p) => {
    pages.push({
      index: pages.length,
      pageNo: pages.length + 1,
      kind: p.kind,
      chapterId: p.chapterId,
      subsectionId: p.subsectionId,
      blocks: p.blocks,
      subsectionTitle: p.subsectionTitle,
      pending: p.pending,
    });
  });

  // 6. Remap TOC entry page numbers into final numbering (content starts
  //    after cover + TOC pages).
  const shift = 1 + tocPageCount; // cover + toc pages
  for (const row of tocRows) row.pageNo += shift;
  for (const k of Object.keys(chapterFirstPages)) chapterFirstPages[k] += shift;

  // 7. Projection: pages if all pending subsections were filled.
  const pendingSubs = doc.chapters
    .flatMap((c) => c.subsections)
    .filter((s) => s.status !== 'filled' && !s.deterministic).length;
  // A filled subsection averages ~1.9 pages.
  const projected = pages.length + Math.round(pendingSubs * 1.9);

  return { pages, totalPages: pages.length, chapterFirstPages, projectedTotalPages: projected };
}
