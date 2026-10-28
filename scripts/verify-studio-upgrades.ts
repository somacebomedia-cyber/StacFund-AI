// scripts/verify-studio-upgrades.ts
/**
 * StacFund — Verification for the studio upgrades
 * ================================================
 * Programmatic checks (no network, no AI) for:
 *
 *   1. planFinancials  — the real funding-needs engine: summary math,
 *                        deterministic use-of-funds subsection, context
 *                        block, key claims.
 *   2. Skeleton wiring — a register-backed request swaps the AI funding_plan
 *                        subsection for the deterministic one; no register →
 *                        the AI subsection stays.
 *   3. brandKit        — hex normalisation + logo data-URL safety guards.
 *   4. planDocx        — a small plan serialises to a real .docx (PK zip,
 *                        non-trivial size).
 *   5. proposalDocx    — same for a proposal.
 *   6. studioDocs      — pure summary derivation for plans + proposals.
 *
 * Run: npm run verify:studio
 */
import {
  summarizeFundingNeeds,
  buildUseOfFundsSubsection,
  fundingNeedsContextBlock,
  fundingClaimsFromSummary,
  formatRandAmount,
  type FundingNeedItem,
} from '../services/businessPlan/planFinancials';
import { buildPlanSkeleton, type PlanGenRequest, type PlanTailoring } from '../services/businessPlan/planGenerator';
import { computeDepth } from '../services/businessPlan/planDepth';
import { createPlanMeta, documentWordCount, type PlanDocument } from '../services/businessPlan/planSchema';
import { normalizeHexColor, isSafeLogoDataUrl } from '../services/brandKit';
import { planDocxBuffer } from '../services/docx/planDocx';
import { proposalDocxBuffer } from '../services/docx/proposalDocx';
import { createProposalMeta, createBlankSection } from '../services/proposal/proposalSchema';
import type { ProposalDocument } from '../services/proposal/proposalSchema';

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// ─── 1. planFinancials ───────────────────────────────────────────────────────

console.log('\n[1] Funding-needs engine (real figures)');

const needs: FundingNeedItem[] = [
  { id: 'n1', itemName: 'Delivery van (Toyota HiAce)', estimatedCost: 285_000, reason: 'Second route into township retail', status: 'pending', quotationDocName: 'Toyota-quote.pdf' },
  { id: 'n2', itemName: 'Pallet racking', estimatedCost: 120_000, reason: 'Warehouse fit-out', status: 'applied' },
  { id: 'n3', itemName: 'Laptop', estimatedCost: 0, reason: 'zero-cost row — must drop', status: 'pending' },
  { id: 'n4', itemName: 'Already-funded freezer', estimatedCost: 45_000, reason: 'funded elsewhere', status: 'received' },
  { id: 'n5', itemName: 'Working capital (6 months)', estimatedCost: 300_000, reason: 'Running costs while route 2 ramps', status: 'pending' },
];

const summary = summarizeFundingNeeds(needs, 750_000);
check('active items = 3 (zero-cost and received dropped)', summary.count === 3, `got ${summary.count}`);
check('receivedExcluded = 1', summary.receivedExcluded === 1);
check('totalRand = 705 000', summary.totalRand === 705_000, `got ${summary.totalRand}`);
check('coveragePct = 94', summary.coveragePct === 94, `got ${summary.coveragePct}`);
check('gapRand = 45 000 shortfall', summary.gapRand === 45_000, `got ${summary.gapRand}`);
check('items sorted by cost desc', summary.items[0].itemName.includes('Working capital') && summary.items[2].itemName.includes('racking'));

check('formatRandAmount(1234567) = "R1 234 567"', formatRandAmount(1_234_567) === 'R1 234 567', `got ${formatRandAmount(1_234_567)}`);

const sub = buildUseOfFundsSubsection(summary, 750_000, 'R750 000');
check('use-of-funds subsection built', Boolean(sub));
check('subsection is deterministic', Boolean(sub?.deterministic));
check('poolId = funding_plan (required-slot replacement)', sub?.poolId === 'funding_plan');
const table = sub?.blocks.find((b) => b.type === 'table')?.table;
check('table has 3 item rows + total', table?.rows.length === 4, `got ${table?.rows.length}`);
const totalRow = table?.rows[table.rows.length - 1];
check('total row = R705 000', totalRow?.[1] === 'R705 000', `got ${totalRow?.[1]}`);
check('row amounts are real figures', table?.rows[0]?.[1] === 'R300 000' || table?.rows[0]?.[1] === 'R285 000');
const pctSum = (table?.rows.slice(0, 3) || []).reduce((n, r) => n + parseFloat(r[2]), 0);
check('item percentages sum to 100', Math.abs(pctSum - 100) < 0.35, `got ${pctSum.toFixed(2)}`);
const callout = sub?.blocks.find((b) => b.type === 'callout')?.text || '';
check('callout states the shortfall vs requested', callout.includes('R705 000') && callout.includes('R45 000'), callout.slice(0, 90));
const stats = sub?.blocks.find((b) => b.type === 'stats')?.stats || [];
check('stat chips include total + requested + coverage', stats.length >= 3);

const exact = summarizeFundingNeeds(needs.slice(0, 2), 405_000);
const exactSub = buildUseOfFundsSubsection(exact, 405_000, 'R405 000');
const exactCallout = exactSub?.blocks.find((b) => b.type === 'callout')?.text || '';
check('exact match callout confirms alignment', exactCallout.includes('matching the R405 000'), exactCallout.slice(0, 80));

const ctxBlock = fundingNeedsContextBlock(summary, 'R750 000');
check('context block lists every item with its exact amount', ctxBlock.includes('R285 000') && ctxBlock.includes('R120 000') && ctxBlock.includes('R300 000'));
check('context block carries the no-invention rule', ctxBlock.includes('must match the register above exactly'));

const claims = fundingClaimsFromSummary(summary, 'R750 000');
check('key claims include the itemised total', claims.some((c) => c.includes('R705 000')));
check('key claims include the requested amount', claims.some((c) => c.includes('R750 000')));

// ─── 2. Skeleton wiring ──────────────────────────────────────────────────────

console.log('\n[2] Skeleton wiring — deterministic use-of-funds');

const depth = computeDepth({ category: 'development_dfi', amountRand: 750_000, override: 'auto' }, 14);
const tailoring: PlanTailoring = {
  offerings: [{ title: 'Last-mile delivery', brief: 'b', keyPoints: [] }],
  models: [{ title: 'Direct Sales', brief: 'b', recommended: true }],
  personas: [{ title: 'Spaza retailers', sharePct: 60, brief: 'b', keyPoints: [] }],
  subsectionTailoring: {},
  chapterSummaries: {},
};
const meta = createPlanMeta({ businessName: 'Test Traders' });
const baseReq: PlanGenRequest = {
  businessName: 'Test Traders',
  purpose: 'fleet + working capital',
  requestedAmountLabel: 'R750 000',
  requestedAmountRand: 750_000,
  contextBlock: 'CONTEXT: test',
};

const withRegister = buildPlanSkeleton({ ...baseReq, fundingNeedsSummary: summary }, depth, tailoring, meta, null);
const finChapter = withRegister.chapters.find((c) => c.id === 'financial_plan');
const detSub = finChapter?.subsections.find((s) => s.poolId === 'funding_plan');
check('financial_plan has a funding_plan subsection', Boolean(detSub));
check('funding_plan subsection is the deterministic one', Boolean(detSub?.deterministic));
check('deterministic table carries the real total', (detSub?.blocks.find((b) => b.type === 'table')?.table?.rows || []).some((r) => r.includes('R705 000')));
const aiCount = finChapter?.subsections.filter((s) => !s.deterministic).length || 0;
check('AI subsections remain for revenue/P&L etc.', aiCount >= 4, `got ${aiCount}`);
const budgeted = (finChapter?.subsections || []).filter((s) => !s.deterministic && s.targetWords > 0).length;
check('AI subsections still receive word budgets', budgeted >= 4, `got ${budgeted}`);

const withoutRegister = buildPlanSkeleton(baseReq, depth, tailoring, meta, null);
const finChapter2 = withoutRegister.chapters.find((c) => c.id === 'financial_plan');
const aiSub = finChapter2?.subsections.find((s) => s.poolId === 'funding_plan');
check('no register → AI-written funding_plan remains (fallback)', Boolean(aiSub) && !aiSub?.deterministic && (aiSub?.recipe || '').length > 20);

// ─── 3. brandKit guards ──────────────────────────────────────────────────────

console.log('\n[3] Brand kit guards');

check('normalizeHexColor("#1f3a5f") = "#1F3A5F"', normalizeHexColor('#1f3a5f') === '#1F3A5F');
check('normalizeHexColor("1f3") = "#11FF33" (shorthand expanded)', normalizeHexColor('1f3') === '#11FF33');
check('normalizeHexColor("blue") = null', normalizeHexColor('blue') === null);
check('normalizeHexColor("") = null', normalizeHexColor('') === null);
check('safe logo: small PNG data URL accepted', isSafeLogoDataUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='));
check('unsafe logo: javascript: rejected', !isSafeLogoDataUrl('javascript:alert(1)'));
check('unsafe logo: oversized data URL rejected', !isSafeLogoDataUrl(`data:image/png;base64,${'A'.repeat(600_000)}`));

// ─── 4. planDocx ─────────────────────────────────────────────────────────────

console.log('\n[4] Word export — business plan');

const tinyPlan: PlanDocument = {
  id: 'plan_test',
  meta: { ...meta, requestedAmountLabel: 'R750 000' },
  chapters: [
    {
      id: 'executive_summary',
      number: 1,
      title: 'Executive Summary',
      summary: 'A plan built from the funding-needs register.',
      subsections: [
        {
          id: 'sub1',
          title: 'The Opportunity',
          brief: 'b',
          recipe: '',
          targetWords: 100,
          status: 'filled',
          blocks: [
            { id: 'b1', type: 'paragraph', text: 'Test Traders is a last-mile logistics business serving township retail. This plan requests R750 000.' },
            { id: 'b2', type: 'stats', stats: [{ value: 'R705k', label: 'Itemised funding needs' }, { value: '94%', label: 'Request itemised' }] },
            { id: 'b3', type: 'table', table: { caption: 'Use of funds', columns: ['Item', 'Amount (R)'], rows: [['Van', '285 000'], ['Total', '705 000']] } },
            { id: 'b4', type: 'callout', text: 'The register matches the request within 6%.' },
            { id: 'b5', type: 'chart', chart: { kind: 'bar', title: 'Revenue by year', points: [{ label: 'Y1', value: 900 }, { label: 'Y2', value: 1400 }] } },
          ],
        },
      ],
    },
  ],
  templateId: 'institutional',
  depth: { targetPages: 70, minPages: 70, maxPages: 120, targetWords: 26_000, label: 'Comprehensive' },
};

const planBuf = await planDocxBuffer(tinyPlan, {
  businessName: 'Test Traders',
  logoDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  logoWidth: 10,
  logoHeight: 10,
  accentColor: '#0F6B4F',
});
check('plan .docx is a real zip (PK header)', planBuf.subarray(0, 2).toString('latin1') === 'PK');
check('plan .docx has non-trivial size (> 6KB)', planBuf.length > 6_000, `got ${planBuf.length}`);
check('plan .docx contains document.xml', planBuf.toString('latin1').includes('word/document.xml'));

// ─── 5. proposalDocx ─────────────────────────────────────────────────────────

console.log('\n[5] Word export — funding proposal');

const s = createBlankSection('executive_summary');
s.status = 'filled';
s.paragraphs = ['Lerato Logistics moves stock for 42 spaza shops across KZN.'];
s.bullets = ['Route density 3× competitors', 'Asset-light contracts'];
s.stats = [{ value: 'R500 000', label: 'Requested' }];
s.table = { caption: 'Use of funds', columns: ['Item', 'Amount (R)'], rows: [['Van', '350 000'], ['Working capital', '150 000']] };

const proposal: ProposalDocument = {
  meta: { ...createProposalMeta({ businessName: 'Lerato Logistics' }), requestedAmountLabel: 'R500 000' },
  sections: [s],
  templateId: 'protea',
};

const propBuf = await proposalDocxBuffer(proposal);
check('proposal .docx is a real zip (PK header)', propBuf.subarray(0, 2).toString('latin1') === 'PK');
check('proposal .docx has non-trivial size (> 4KB)', propBuf.length > 4_000, `got ${propBuf.length}`);

// ─── 6. studioDocs summary derivation (pure parts) ───────────────────────────

console.log('\n[6] Studio persistence — summary derivation');
check('plan word count > 0', documentWordCount(tinyPlan) > 0);
check('proposal has 1 included section', proposal.sections.filter((x) => x.include).length === 1);

// ─── Result ──────────────────────────────────────────────────────────────────

console.log('\n──────────────────────────────────────────────');
if (failures === 0) {
  console.log('ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`${failures} CHECK(S) FAILED`);
  process.exit(1);
}
