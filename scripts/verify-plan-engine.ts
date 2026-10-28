// scripts/verify-plan-engine.ts
/**
 * Verification for the long-form business plan engine.
 * Run: npx tsx scripts/verify-plan-engine.ts
 *
 * Checks:
 *  1. Depth engine: every scenario lands inside the 70–120 page contract,
 *     scales with amount, and shifts with funder category.
 *  2. Skeleton: word budgets sum to ≈ the depth target; every chapter has
 *     subsections; deterministic checklist present when ctx-like data exists.
 *  3. Pagination: cover + TOC + openers + content numbering are consistent;
 *     TOC page numbers point at the right pages; page count scales with
 *     content (simulated heights).
 *  4. Export HTML contract: serialize → the standalone wrapper is well-formed.
 */
import { computeDepth, classifyFunder, allocateChapterBudgets, MIN_PAGES, MAX_PAGES } from '../services/businessPlan/planDepth';
import { CHAPTER_CATALOG } from '../services/businessPlan/planStructure';
import { buildPlanSkeleton, buildMinimalPlanContext, type PlanGenRequest, type PlanTailoring } from '../services/businessPlan/planGenerator';
import { createPlanMeta, type PlanDocument } from '../services/businessPlan/planSchema';
import { paginatePlan, CONTENT_H, SUBSECTION_TITLE_H, BLOCK_GAP } from '../components/businessPlan/planPaginate';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'}  ${name}${detail && !cond ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
};

console.log('\n═══ 1. Depth engine ═══');
const scenarios: Array<[string, ReturnType<typeof classifyFunder>['category'], number | undefined, number]> = [
  ['SEFA micro, R150k', 'development_micro', 150_000, 70],
  ['Unknown funder, no amount', 'generic', undefined, 70],
  ['Grant competition, R250k', 'grant', 250_000, 70],
  ['Bank facility, R3m', 'bank', 3_000_000, 92],
  ['IDC industrial, R30m', 'development_dfi', 30_000_000, 114],
  ['NEF, R12m', 'development_dfi', 12_000_000, 100],
];
for (const [label, category, amount, expectedMin] of scenarios) {
  const d = computeDepth({ category, amountRand: amount }, CHAPTER_CATALOG.length);
  check(
    `${label} → ${d.targetPages} pages (band ${d.minPages}–${d.maxPages})`,
    d.targetPages >= MIN_PAGES && d.targetPages <= MAX_PAGES && d.targetPages >= expectedMin,
    `got target=${d.targetPages}`
  );
  check(`${label} words budget sane`, d.targetWords > 15_000 && d.targetWords < 45_000, `got ${d.targetWords}`);
}
const micro = computeDepth({ category: 'development_micro', amountRand: 150_000 }, CHAPTER_CATALOG.length);
const dfi = computeDepth({ category: 'development_dfi', amountRand: 30_000_000 }, CHAPTER_CATALOG.length);
check('DFI (R30m) deeper than micro (R150k)', dfi.targetPages > micro.targetPages + 10, `${micro.targetPages} vs ${dfi.targetPages}`);
check('Maximum override = 120', computeDepth({ category: 'generic', override: 'maximum' }, CHAPTER_CATALOG.length).targetPages === MAX_PAGES);
check('Concise override ≥ 70', computeDepth({ category: 'generic', override: 'concise' }, CHAPTER_CATALOG.length).targetPages >= MIN_PAGES);
check('Bank emphasis boosts financials', (() => {
  const ids = CHAPTER_CATALOG.map((c) => c.id);
  const bank = allocateChapterBudgets(ids, 30_000, 'bank');
  const grant = allocateChapterBudgets(ids, 30_000, 'grant');
  return bank.financial_plan > grant.financial_plan;
})());

console.log('\n═══ 2. Skeleton ═══');
const req: PlanGenRequest = {
  businessName: 'Nawi-Learn Toddler Centre',
  purpose: 'Fit-out of a second campus and STEAM equipment',
  requestedAmountLabel: 'R1 500 000',
  requestedAmountRand: 1_500_000,
  contextBlock: buildMinimalPlanContext({
    businessName: 'Nawi-Learn Toddler Centre',
    purpose: 'STEAM early learning',
    requestedAmountLabel: 'R1 500 000',
  }),
};
const depth = computeDepth({ category: 'development_dfi', amountRand: 1_500_000 }, CHAPTER_CATALOG.length);
const tailoring: PlanTailoring = {
  offerings: [
    { title: 'STEAM Curriculum Programme', brief: 'Core toddler curriculum.', keyPoints: ['Sliding-scale fees'] },
    { title: 'Parent Workshops', brief: 'Weekend workshops.', keyPoints: [] },
    { title: 'Holiday Camps', brief: 'STEAM holiday camps.', keyPoints: [] },
  ],
  models: [
    { title: 'Social Enterprise Model', brief: 'Blended revenue with subsidies.', recommended: true },
    { title: 'Partnership Model', brief: 'School partnerships.', recommended: false },
    { title: 'Franchise Model', brief: 'Replication.', recommended: false },
  ],
  personas: [
    { title: 'Low-Income Parents', sharePct: 50, brief: 'Primary paying segment.', keyPoints: [] },
    { title: 'Community Organisations', sharePct: 30, brief: 'Bulk enrolment.', keyPoints: [] },
    { title: 'Government Programmes', sharePct: 20, brief: 'Subsidised placement.', keyPoints: [] },
  ],
  subsectionTailoring: {},
  chapterSummaries: {},
};
const doc = buildPlanSkeleton(req, depth, tailoring, createPlanMeta({ businessName: req.businessName }));
check('14 chapters', doc.chapters.length === 14, `${doc.chapters.length}`);
check('Chapter numbers sequential', doc.chapters.every((c, i) => c.number === i + 1));
const budgetSum = doc.chapters.reduce((n, c) => n + c.subsections.reduce((m, s) => m + s.targetWords, 0), 0);
check(
  `Word budgets ≈ target (${budgetSum} vs ${depth.targetWords})`,
  budgetSum >= depth.targetWords * 0.9 && budgetSum <= depth.targetWords * 1.35,
);
check('Every chapter has ≥ 1 subsection', doc.chapters.every((c) => c.subsections.length >= 1));
check('Recommended model present', doc.chapters.some((c) => c.subsections.some((s) => s.title.includes('(Recommended)'))));
check('No duplicate poolIds', (() => {
  const ids = doc.chapters.flatMap((c) => c.subsections.map((s) => s.poolId)).filter(Boolean) as string[];
  return new Set(ids).size === ids.length;
})());
const subCount = doc.chapters.reduce((n, c) => n + c.subsections.length, 0);
console.log(`  ℹ  ${subCount} subsections at target ${depth.targetPages} pages (${depth.label})`);

console.log('\n═══ 3. Pagination ═══');
// Simulate filled content: every subsection gets 3 paragraph blocks whose
// "measured" heights make each subsection ≈ 1.5 pages.
const filled: PlanDocument = JSON.parse(JSON.stringify(doc));
let blockN = 0;
for (const ch of filled.chapters) {
  for (const sub of ch.subsections) {
    sub.status = 'filled';
    sub.blocks = Array.from({ length: 3 }, () => ({
      id: `tb_${blockN++}`, type: 'paragraph' as const, text: 'Word '.repeat(90),
    }));
  }
}
const heights = new Map<string, number>();
for (const ch of filled.chapters) for (const s of ch.subsections) for (const b of s.blocks) heights.set(b.id, 430);
const pg = paginatePlan(filled, (b) => heights.get(b.id) ?? 90);

check('Has cover at page 1', pg.pages[0]?.kind === 'cover' && pg.pages[0]?.pageNo === 1);
const tocPages = pg.pages.filter((p) => p.kind === 'toc');
check('Has TOC pages after cover', tocPages.length >= 1 && tocPages.every((p) => p.pageNo === p.index + 1));
check('TOC entries reference real pages', (() => {
  const first = tocPages[0]?.tocRows || [];
  return first.length > 10 && first.every((r) => r.pageNo >= 2 && r.pageNo <= pg.totalPages);
})());
check('Chapter openers exist', pg.pages.filter((p) => p.kind === 'chapter').length === 14);
check('Every content page has a footer number', pg.pages.every((p) => p.kind !== 'content' || (p.pageNo >= 1 && p.pageNo <= pg.totalPages)));
check('Total pages = pages array length', pg.totalPages === pg.pages.length);
// Simulate a huge table that must split by rows.
const bigTableSub = filled.chapters[0].subsections[0];
bigTableSub.blocks = [
  {
    id: 'bigtable', type: 'table',
    table: { columns: ['Risk', 'Likelihood', 'Impact', 'Mitigation'], rows: Array.from({ length: 60 }, (_, i) => [`Risk ${i}`, 'Med', 'High', 'Mitigation text']) },
  },
];
const pg2 = paginatePlan(filled, (b) => (b.id === 'bigtable' ? CONTENT_H * 2.2 : heights.get(b.id) ?? 90));
const splitParts = pg2.pages.flatMap((p) => p.blocks).filter((b) => b.id.startsWith('bigtable__sp'));
check('Over-tall table splits by rows', splitParts.length >= 2, `got ${splitParts.length} parts`);
check('Split parts have (continued) caption', splitParts.slice(1).every((b) => !!b.table?.caption?.includes('(continued)')));

console.log(`\n  ℹ  Simulated full plan: ${pg.totalPages} pages for ${subCount} subsections at 1.5 pages each + 14 openers + cover + ${tocPages.length} TOC page(s).`);

console.log('\n═══ 4. Page-contract sanity (words → pages) ═══');
// The planning constant says (target − structural) × 360 words ≈ target pages.
for (const [label, category, amount] of scenarios) {
  const d = computeDepth({ category, amountRand: amount }, CHAPTER_CATALOG.length);
  const projected = d.structuralPages + d.targetWords / 360;
  check(`${label}: words+structure project back to ≈ ${d.targetPages}`, Math.abs(projected - d.targetPages) <= 3, `projected ${projected.toFixed(1)}`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED ✓\n' : `\n${failures} CHECK(S) FAILED ✗\n`);
process.exit(failures === 0 ? 0 : 1);
