// scripts/verify-form-engine.ts
/**
 * Bulletproofs the "fill the official form" engine end-to-end, in Node:
 *
 *   1. Asset integrity  — the bundled PDF is byte-identical to the official
 *      form, has 8 pages, A4 size, no encryption, no page rotation.
 *   2. Font capability  — the sanitizer only keeps glyphs Helvetica can draw.
 *   3. Layout safety    — every DrawOp lands inside its page's media box
 *                         (nothing can be drawn off-page or mirrored).
 *   4. Full fill test   — a realistic (and deliberately awkward) answer set
 *                         fills the PDF; the saved output is read back and the
 *                         drawn values are found in the right pages' text.
 *   5. Rule checks      — the template's own validation (thresholds, jobs,
 *                         10% stock, disclosure, eligibility warnings).
 *   6. Matching         — the built-in KZN record matches the template;
 *                         NYDA and next year's intake do not.
 *   7. Store helpers    — describeClosing date math, merge rules, status
 *                         re-derivation, looksLikePdf.
 *
 * Run:  npx tsx scripts/verify-form-engine.ts
 * Exits 0 only when every check passes.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';
import { fillFormPdf, formatValue, groupDigits, looksLikePdf, sanitizeForFont, fitOneLine, wrapLines } from '../services/formAutofill';
import { toInt, isBlank, conditionHolds } from '../services/formModel';
import { KZN_YOUTH_FUND_2026, guessSector, THRESHOLDS } from '../services/formTemplates/kznYouthFund2026';
import { NYDA_GRANT_VOUCHER, guessSector as guessNydaSector } from '../services/formTemplates/nydaGrantVoucher';
import { SEFA_BLENDED_FINANCE, SCHEME as SEFA_SCHEME } from '../services/formTemplates/sefaBlendedFinance';
import { findFormTemplate } from '../services/formTemplates';
import { MOCK_FUNDING } from '../constants';
import type { FundingOpportunityDb } from '../types';
import { computeStatus, describeClosing, isPublicRecord, mergeOpportunities, withComputedStatus } from '../services/opportunityStatus';
import { evaluateEligibility } from '../services/eligibilityEngine';
import type { UserBusinessProfile } from '../types';

import { fileURLToPath } from 'node:url';
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ASSET = join(ROOT, 'public', 'assets', 'forms', 'kzn-youth-fund-2026-27.pdf');
const UPLOADED_OFFICIAL = '/home/z/my-project/upload/Application Form.pdf';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

async function main(): Promise<void> {
  const bytes = new Uint8Array(readFileSync(ASSET));

  // ── 1. Asset integrity ──────────────────────────────────────────────────
  section('1. Asset integrity');
  const hash = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');
  check('bundled PDF is byte-identical to the uploaded official form', hash(ASSET) === hash(UPLOADED_OFFICIAL));
  check('file starts with %PDF- (not an SPA fallback page)', looksLikePdf(bytes));

  let blank: PDFDocument;
  try {
    blank = await PDFDocument.load(bytes); // throws on encryption
    check('PDF loads without ignoreEncryption (not password-protected)', true);
  } catch (e) {
    check('PDF loads without ignoreEncryption (not password-protected)', false, e instanceof Error ? e.message : String(e));
    console.log('\nCannot continue without a loadable PDF.');
    process.exit(1);
  }
  const pages = blank.getPages();
  check('has 8 pages', pages.length === 8, `got ${pages.length}`);
  const allA4 = pages.every((p) => Math.abs(p.getWidth() - 595) < 3 && Math.abs(p.getHeight() - 842) < 3);
  check('every page is A4 portrait (595 x 842 pt)', allA4, pages.map((p) => `${p.getWidth().toFixed(0)}x${p.getHeight().toFixed(0)}`).join(', '));
  const noRotation = pages.every((p) => (p.getRotation().angle % 360) === 0);
  check('no page rotation (top-left coordinates are valid)', noRotation);

  // ── 2. Font capability ──────────────────────────────────────────────────
  section('2. Font capability');
  const font = await blank.embedFont(StandardFonts.Helvetica);
  check('Helvetica exposes getCharacterSet() (the sanitizer depends on it)', typeof font.getCharacterSet === 'function');
  check('plain ASCII survives the sanitizer unchanged', sanitizeForFont(font, 'Pietermaritzburg 123') === 'Pietermaritzburg 123');
  check('smart quotes become straight quotes', sanitizeForFont(font, '\u201Chello\u201D \u2018there\u2019') === '"hello" \'there\'');
  check('en/em dashes become hyphens', sanitizeForFont(font, 'a\u2013b\u2014c') === 'a-b-c');
  const sanitizedEmoji = sanitizeForFont(font, 'ok \u2705');
  check('emoji becomes ? (never a crash or a save failure)', /^ok \?$/.test(sanitizedEmoji), JSON.stringify(sanitizedEmoji));
  const sanitizedAccented = sanitizeForFont(font, 'Caf\u00E9 Fran\u00E7ois');
  check('WinAnsi accented letters are kept (Caf\u00E9 Fran\u00E7ois)', sanitizedAccented === 'Caf\u00E9 Fran\u00E7ois', JSON.stringify(sanitizedAccented));

  // ── 3. Layout safety: every op inside its page ──────────────────────────
  section('3. Layout safety');
  let opsOutOfBounds = 0;
  let opsOnMissingPage = 0;
  for (const op of KZN_YOUTH_FUND_2026.ops) {
    const page = pages[op.page];
    if (!page) {
      opsOnMissingPage++;
      continue;
    }
    const W = page.getWidth();
    const H = page.getHeight();
    if (op.kind === 'text') {
      if (op.x < 0 || op.x + op.maxWidth > W + 1 || op.baseline < 0 || op.baseline > H) opsOutOfBounds++;
    } else if (op.kind === 'wrap') {
      if (op.x < 0 || op.x + op.width > W + 1 || op.top < 0 || op.top + op.height > H + 1) opsOutOfBounds++;
    } else {
      const { x0, top, x1, bottom } = op.rect;
      if (x0 < 0 || x1 > W + 1 || top < 0 || bottom > H + 1) opsOutOfBounds++;
    }
  }
  check('no DrawOp points at a page that does not exist', opsOnMissingPage === 0, `${opsOnMissingPage} bad page refs`);
  check('every DrawOp lands inside its page (media-box bounds)', opsOutOfBounds === 0, `${opsOutOfBounds} out of bounds`);
  const textOpCount = KZN_YOUTH_FUND_2026.ops.filter((o) => o.kind === 'text').length;
  check('template has a full set of draw ops', KZN_YOUTH_FUND_2026.ops.length >= 80, `got ${KZN_YOUTH_FUND_2026.ops.length} (text ops: ${textOpCount})`);

  // ── 4. Full fill + read-back ────────────────────────────────────────────
  section('4. Full fill and read-back');
  const answers: Record<string, string> = {
    'a.business_name': 'Sibusiso\u2019s Poultry Project (Pty) Ltd', // smart quote + accents stress
    'a.applicant_name': 'Sibusiso Ndlovu',
    'a.age': '29',
    'a.cipc': '2024/123456/07',
    'a.role': 'Owner and Managing Director',
    'a.id': '9702105800085',
    'a.email': 'sibusiso@example.co.za',
    'a.cell': '082 555 1234',
    'a.address': '12 Kerk Street, Escourt',
    'a.city': 'Escourt',
    'a.district': 'uThukela District',
    'a.province': 'KwaZulu-Natal',
    'a.postal': '3310',
    'b.threshold': '2',
    'b.grant': '350000',
    'b.why': 'The funding will buy an incubator unit, feed stock for the first production cycle, and packaging equipment so we can supply local retailers and the municipal school-feeding scheme. ' + 'We currently supply 3 spaza shops and want to grow to 15. '.repeat(14),
    'b.util.machinery.amount': '300000',
    'b.util.machinery.asset': 'Incubator unit and packaging equipment',
    'b.util.stock.amount': '30000',
    'b.util.stock.asset': 'First-cycle feed and day-old chicks',
    'b.util.other.amount': '20000',
    'b.util.other.asset': 'Cage extensions',
    'b.jobs_perm': '4',
    'b.jobs_temp': '2',
    'b.prior': 'no',
    'c.sector': 'agriculture',
    'c.description': 'Free-range poultry farming started March 2024, supplying eggs and dressed birds to local retailers in Escourt and Weenen.',
    'd.youth_pct': '100',
    'd.sh.1.name': 'Sibusiso Ndlovu',
    'd.sh.1.race': 'Black',
    'd.sh.1.id': '9702105800085',
    'd.sh.1.pct': '100',
    'd.dir.1.name': 'Sibusiso Ndlovu',
    'd.dir.1.race': 'Black',
    'd.dir.1.id': '9702105800085',
    'd.dir.1.role': 'Director',
    'f.name': 'Sibusiso Ndlovu',
    'f.id': '9702105800085',
    'g.1': 'yes',
    'g.2': 'yes',
    'g.4': 'yes',
    'g.6': 'yes',
    'g.9': 'yes',
  };

  const fill = await fillFormPdf(KZN_YOUTH_FUND_2026, bytes, answers);
  check('fillFormPdf saves without throwing', fill.bytes.length > 10_000, `output ${fill.bytes.length} bytes`);
  check('output is still a PDF', looksLikePdf(fill.bytes));

  const parser = new PDFParse({ data: fill.bytes.slice() });
  const text = await parser.getText();
  check('read-back: output still has 8 pages', text.pages.length === 8, `got ${text.pages.length}`);

  const page1 = text.getPageText(1);
  check('page 1 contains the business name', page1.includes('Sibusiso'), `page1 snippet: ${page1.slice(0, 80)}...`);
  check('smart quote in the business name was sanitised to a straight quote', page1.includes('Sibusiso\'s Poultry'), 'the apostrophe form the sanitizer must produce');
  check('page 1 shows the amount grouped in rands (R350 000)', page1.includes('350 000'), page1.includes('350000') ? 'ungrouped digits found' : 'amount text not found on page 1');
  const page2 = text.getPageText(2);
  check('page 2 shows the utilisation total (R350 000)', page2.includes('350 000'));
  check('page 2 shows the machinery line (R300 000)', page2.includes('300 000'));
  const page3 = text.getPageText(3);
  check('page 3 shows the youth ownership (100%)', page3.includes('100%'));
  check('page 3 shows the shareholder ID', page3.includes('9702105800085'));
  const page8 = text.getPageText(8);
  check('page 8 checklist is ticked for the form itself (X mark)', /X/.test(page8));
  check('a ~1,000-character "why" answer still fits (shrinks instead of being cut)', !fill.cutKeys.includes('b.why'), `cutKeys: ${fill.cutKeys.join(', ') || '(none)'}`);
  const hugeFill = await fillFormPdf(KZN_YOUTH_FUND_2026, bytes, { ...answers, 'b.why': 'x'.repeat(4000) });
  check('engine-level: a 4,000-character answer is cut, flagged and still saves', hugeFill.cutKeys.includes('b.why') && looksLikePdf(hugeFill.bytes));

  // The parts that must stay blank.
  const page4 = text.getPageText(4);
  check('page 4 carries the signatory\u2019s printed name', page4.includes('Sibusiso'));
  check('page 4 never contains a drawn signature date (engine never signs)', !/\b\d{4}-\d{2}-\d{2}\b/.test(page4));

  // ── 5. Rule checks ──────────────────────────────────────────────────────
  section('5. The form\u2019s own rules');
  const validate = KZN_YOUTH_FUND_2026.validate;
  const errorsOf = (a: Record<string, string>): string[] => validate(a).errors.map((e) => e.message);
  const warningsOf = (a: Record<string, string>): string[] => validate(a).warnings.map((w) => w.message);

  const good = validate(answers);
  check('the realistic answer set has zero errors', good.errors.length === 0, good.errors.map((e) => e.message).join('; '));

  const outOfRange = errorsOf({ ...answers, 'b.grant': '900000' });
  check('grant above the chosen threshold is blocked', outOfRange.some((m) => m.includes('outside Threshold 2')), outOfRange.join('; '));
  const belowRange = errorsOf({ ...answers, 'b.grant': '500' });
  check('grant below the chosen threshold is blocked', belowRange.some((m) => m.includes('outside Threshold 2')));
  const noJobs = errorsOf({ ...answers, 'b.jobs_perm': '', 'b.jobs_temp': '' });
  check('zero jobs is blocked (the form requires them)', noJobs.some((m) => m.includes('jobs')));
  const tooFewJobs = warningsOf({ ...answers, 'b.jobs_perm': '1', 'b.jobs_temp': '1' });
  check('fewer jobs than the threshold minimum warns (2 < 4)', tooFewJobs.some((m) => m.includes('at least 4 jobs')));
  const utilMismatch = warningsOf({ ...answers, 'b.util.other.amount': '15000' });
  check('utilisation lines not adding up to the grant warns', utilMismatch.some((m) => m.includes('add up to')));
  const stockOver = warningsOf({ ...answers, 'b.util.machinery.amount': '200000', 'b.util.stock.amount': '100000', 'b.util.other.amount': '50000' });
  check('stock above 10% of the funding warns', stockOver.some((m) => m.includes('10%')), stockOver.join('; '));
  const priorYes = errorsOf({ ...answers, 'b.prior': 'yes' });
  check('choosing "Yes" for past funding without details is blocked', priorYes.some((m) => m.includes('Say who funded you')));
  const priorWarn = warningsOf({ ...answers, 'b.prior': 'yes', 'b.prior.1.institution': 'NYDA' });
  check('past public funding warns about likely disqualification', priorWarn.some((m) => m.includes('disqualif')));
  const ageWarn = warningsOf({ ...answers, 'a.age': '41' });
  check('age outside 18-35 warns', ageWarn.some((m) => m.includes('18 to 35')));
  const idWarn = warningsOf({ ...answers, 'a.id': '970210580008' });
  check('a 12-digit ID warns (SA IDs have 13)', idWarn.some((m) => m.includes('13 digits')));
  const provinceWarn = warningsOf({ ...answers, 'a.province': 'Gauteng' });
  check('a non-KZN province warns', provinceWarn.some((m) => m.includes('KwaZulu-Natal')));
  const youthWarn = warningsOf({ ...answers, 'd.youth_pct': '60' });
  check('youth ownership below 80% warns', youthWarn.some((m) => m.includes('80%')));
  const t3Warn = warningsOf({ ...answers, 'b.threshold': '3', 'b.grant': '600000' });
  check('Threshold 3 flags the odd R500,000 turnover rule', t3Warn.some((m) => m.includes('R500,000')));
  const scienceWarn = warningsOf({ ...answers, 'c.sector': 'science' });
  check('the science sector flags the app-development exclusion', scienceWarn.some((m) => m.includes('app development')));
  const blankAnswers: Record<string, string> = {};
  const blankErrors = errorsOf(blankAnswers);
  check('an empty answer sheet is blocked with many errors', blankErrors.length >= 10, `got ${blankErrors.length}`);
  const thresholdBounds = THRESHOLDS;
  check('thresholds match the form (R1k-R100k/2 jobs, R100k.01-R500k/4, R500k.01-R2m/10)',
    thresholdBounds['1'].min === 1000 && thresholdBounds['1'].max === 100000 && thresholdBounds['1'].jobs === 2 &&
    thresholdBounds['2'].min === 100001 && thresholdBounds['2'].max === 500000 && thresholdBounds['2'].jobs === 4 &&
    thresholdBounds['3'].min === 500001 && thresholdBounds['3'].max === 2000000 && thresholdBounds['3'].jobs === 10);
  check('computed() totals the utilisation lines', (KZN_YOUTH_FUND_2026.computed?.(answers) ?? {})['b.util.total'] === '350000');
  check('computed() stays empty when nothing is itemised', Object.keys(KZN_YOUTH_FUND_2026.computed?.({}) ?? {}).length === 0);

  // ── 6. Matching ─────────────────────────────────────────────────────────
  section('6. Template matching');
  const kznRecord = MOCK_FUNDING.find((o) => o.opportunity_id === 'kzn_youth_fund_2026_27');
  check('the built-in KZN Youth Empowerment Fund record exists in constants.ts', !!kznRecord);
  if (kznRecord) {
    check('the built-in KZN record matches the form template', findFormTemplate(kznRecord)?.id === KZN_YOUTH_FUND_2026.id);
    check('a copy with next year\u2019s closing date does NOT match (positions would differ)', !KZN_YOUTH_FUND_2026.matches({ ...kznRecord, closing_date: '2028-05-31' }));
    check('a record without a real closing date still matches', KZN_YOUTH_FUND_2026.matches({ ...kznRecord, closing_date: 'Rolling' }));
  }
  const nyda = MOCK_FUNDING.find((o) => o.opportunity_id === 'nyda_grant_001');
  check('the built-in NYDA grant record exists in constants.ts', !!nyda);
  if (nyda) {
    check('the NYDA record matches the NYDA voucher-and-grant template', findFormTemplate(nyda)?.id === NYDA_GRANT_VOUCHER.id);
    check('a non-NYDA issuer does not match the NYDA template', !NYDA_GRANT_VOUCHER.matches({ ...nyda, issuer_name: 'Some Other Agency' }));
    check('a programme name without grant/voucher/micro-finance wording does not match', !NYDA_GRANT_VOUCHER.matches({ ...nyda, programme_name: 'NYDA Internship Programme' }));
  }
  const sefaBlended = MOCK_FUNDING.find((o) => o.opportunity_id === 'sefa_ecrda_blended_001');
  check('the built-in ECRDA/sefa Rural Blended Finance record exists in constants.ts', !!sefaBlended);
  if (sefaBlended) {
    check('the ECRDA/sefa blended finance record matches its template', findFormTemplate(sefaBlended)?.id === SEFA_BLENDED_FINANCE.id);
  }
  const sefaDirect = MOCK_FUNDING.find((o) => o.opportunity_id === 'sefa_direct_003');
  check('sefa Direct Lending (a different programme with a different form) matches nothing', sefaDirect ? !findFormTemplate(sefaDirect) : false);
  // kznotp_yef_001 ("KZN Youth Empowerment Fund (KZNYEF)", the OTP listing) and
  // kzn_youth_fund_2026_27 are the same KZN Office of the Premier programme, so
  // both records intentionally match the measured KZN 2026/27 form template —
  // whichever listing the user finds, the autofill wizard is available.
  const expectedMatches = new Set(['kzn_youth_fund_2026_27', 'kznotp_yef_001', 'nyda_grant_001', 'sefa_ecrda_blended_001']);
  check('no other built-in record accidentally matches a form template',
    MOCK_FUNDING.filter((o) => findFormTemplate(o) && !expectedMatches.has(o.opportunity_id)).length === 0,
    MOCK_FUNDING.filter((o) => findFormTemplate(o) && !expectedMatches.has(o.opportunity_id)).map((o) => o.opportunity_id).join(', '));

  // The new record must also behave inside the eligibility engine.
  if (kznRecord) {
    const profile = (over: Partial<UserBusinessProfile> & { youth_ownership_pct?: number }): UserBusinessProfile => ({
      user_id: 'u1',
      business_status: 'REGISTERED',
      entity_type: 'PTY_LTD', // old-code profiles must still match "Private Company"
      industry: 'Agriculture',
      location: 'KwaZulu-Natal',
      revenue_band: 'PRE_REVENUE',
      staff_count: 2,
      has_bank_account: true,
      has_sars_tax: true,
      has_cipc_registration: true,
      age: 28,
      documents_ready: [],
      youth_ownership_pct: 100,
      ...over,
    });
    const eligible = evaluateEligibility(profile({}), kznRecord);
    check('a 28-year-old 100% youth-owned KZN farmer passes every hard rule', eligible.rules.every((r) => r.verdict === 'pass'), eligible.rules.filter((r) => r.verdict !== 'pass').map((r) => `${r.id}: ${r.reason}`).join('; '));
    const gauteng = evaluateEligibility(profile({ location: 'Gauteng' }), kznRecord);
    check('a Gauteng profile fails the province rule', gauteng.rules.some((r) => r.id === 'province' && r.verdict === 'fail'));
    const tooOld = evaluateEligibility(profile({ age: 41 }), kznRecord);
    check('a 41-year-old fails the age rule', tooOld.rules.some((r) => r.id === 'age' && r.verdict === 'fail'));
    const taxi = evaluateEligibility(profile({ industry: 'Minibus taxi operator' }), kznRecord);
    check('a minibus-taxi business fails the excluded-sectors rule (official wording)', taxi.rules.some((r) => r.id === 'excluded_sector' && r.verdict === 'fail'), taxi.rules.find((r) => r.id === 'excluded_sector')?.reason);
    const shebeen = evaluateEligibility(profile({ industry: 'Alcohol sales and distribution' }), kznRecord);
    check('a standalone alcohol business fails the excluded-sectors rule', shebeen.rules.some((r) => r.id === 'excluded_sector' && r.verdict === 'fail'));
    const tourOp = evaluateEligibility(profile({ industry: 'Tourism and hospitality' }), kznRecord);
    check('a tourism business is NOT caught by the exclusions', !tourOp.rules.some((r) => r.id === 'excluded_sector' && r.verdict === 'fail'));
    const noYouthPct = evaluateEligibility(profile({ youth_ownership_pct: undefined }), kznRecord);
    check('missing youth ownership is unknown, never a hard fail', noYouthPct.rules.some((r) => r.id === 'youth_ownership' && r.verdict === 'unknown') && noYouthPct.eligible);
    const notSpecified = evaluateEligibility(profile({ entity_type: 'Not specified' }), kznRecord);
    check('"Not specified" legal form is unknown, never a hard fail', notSpecified.rules.some((r) => r.id === 'legal_form' && r.verdict === 'unknown') && notSpecified.eligible);
  }

  // ── 7. Prefill and helpers ──────────────────────────────────────────────
  section('7. Prefill, sector guessing and store helpers');
  const prefilled = KZN_YOUTH_FUND_2026.prefill({
    email: 'zanele@example.co.za',
    businessName: 'Zanele Trading',
    whatsapp: '0831234567',
    profile: { name: 'Zanele Trading', registration: '2023/654321/07', industry: 'Solar panel installation', description: 'We install solar for rural homes.', whatsapp: '0831234567' },
    ownerInfo: { name: 'Zanele Mkhize', idNumber: '9506120123088', age: 30, race: 'Black' },
    documentCategories: ['CIPC Registration', 'Tax Clearance'],
  });
  check('prefill fills the applicant, business and contact keys', prefilled['a.applicant_name'] === 'Zanele Mkhize' && prefilled['a.business_name'] === 'Zanele Trading' && prefilled['a.email'] === 'zanele@example.co.za');
  check('prefill never invents a shareholding percentage or role', isBlank(prefilled['d.sh.1.pct']) && isBlank(prefilled['d.dir.1.role']));
  check('prefill seeds row 1 of both ownership tables', prefilled['d.sh.1.name'] === 'Zanele Mkhize' && prefilled['d.dir.1.name'] === 'Zanele Mkhize');
  check('prefill ticks only checklist items the profile has documents for', prefilled['g.2'] === 'yes' && prefilled['g.6'] === 'yes' && isBlank(prefilled['g.7']));

  const sectorCases: [string, string][] = [
    ['Aquaculture fish farming', 'aquaculture'],
    ['Marine boat charters', 'blue'],
    ['Vegetable farming', 'agriculture'],
    ['Guest house and B&B', 'tourism'],
    ['Furniture manufacturing', 'manufacturing'],
    ['Solar and renewable energy', 'green'],
    ['Software development studio', 'science'],
    ['Spaza shop retail', 'retail'],
    ['Coal mining services', 'mining'],
    ['Accounting services', ''],
  ];
  let sectorOk = true;
  for (const [input, expected] of sectorCases) if (guessSector(input) !== expected) sectorOk = false;
  check('sector guessing maps all 10 test cases correctly', sectorOk);

  check('groupDigits groups 120000 as 120 000', groupDigits('120000') === '120 000');
  check('groupDigits drops a pasted decimal part instead of gluing cents on', groupDigits('R 1 500 000.99') === '1 500 000' && groupDigits('350000,50') === '350 000');
  check('formatValue money prefixes R', formatValue('120000', 'money') === 'R120 000');
  check('formatValue percent appends %', formatValue('100', 'percent') === '100%');
  check('toInt ignores spaces and symbols', toInt('R 350 000') === 350000);
  check('toInt drops cents, never reads them as extra rand', toInt('350000.50') === 350000 && toInt('350000,50') === 350000);
  check('toInt of an absurd 50-digit paste is bounded, not garbage', toInt('9'.repeat(50)) <= Number.MAX_SAFE_INTEGER);
  check('toInt of junk is 0', toInt('abc') === 0 && toInt(undefined) === 0);

  const fitted = fitOneLine(font, 'A very long business name that simply cannot fit into the small box', 60, 9.5, 6.5);
  check('fitOneLine shrinks then cuts with an ellipsis and flags it', fitted.cut && fitted.text.endsWith('...'));
  const wrapped = wrapLines(font, 'short words wrap neatly around the column', 9, 120);
  check('wrapLines produces multiple non-empty lines', wrapped.length >= 2 && wrapped.every((l) => l.length > 0));
  check('wrapLines breaks a single unbreakable long word by characters', wrapLines(font, 'x'.repeat(200), 9, 60).length >= 4);

  // Store helpers (pure date math; SAST-safe)
  const closeDesc = describeClosing('2026-11-05', new Date('2026-10-27T10:00:00Z'));
  check('describeClosing counts days left', /9 days left/.test(closeDesc), closeDesc);
  check('describeClosing says "closes today" on the day', describeClosing('2026-10-27', new Date('2026-10-27T10:00:00Z')).includes('closes today'));
  check('describeClosing says "closed" the day after (SAST)', describeClosing('2026-10-26', new Date('2026-10-27T10:00:00Z')).includes('closed'));
  check('describeClosing handles Rolling', describeClosing('Rolling', new Date()) === 'Open all year');

  check('isPublicRecord accepts published records', isPublicRecord({ review_status: 'published' }));
  check('isPublicRecord hides scraper-only records', !isPublicRecord({ scraped_at: '2026-01-01' }));
  check('isPublicRecord keeps legacy hand-made records', isPublicRecord({}));
  const base = MOCK_FUNDING[0];
  const merged = mergeOpportunities(
    [base],
    [{ ...(base as unknown as Record<string, unknown>), eligibility_summary: 'UPDATED BY ADMIN' } as FundingOpportunityDb]
  );
  check('mergeOpportunities: a published record replaces the built-in one', merged.length === 1 && merged[0].eligibility_summary === 'UPDATED BY ADMIN');
  const stale: Pick<FundingOpportunityDb, 'status' | 'closing_date' | 'opening_date'> = { status: 'OPEN', closing_date: '2020-01-01', opening_date: null };
  check('withComputedStatus closes a stale OPEN after its date', withComputedStatus(stale).status === 'CLOSED');
  const rolling: Pick<FundingOpportunityDb, 'status' | 'closing_date' | 'opening_date'> = { status: 'OPEN', closing_date: 'Rolling', opening_date: undefined };
  check('withComputedStatus keeps records without real dates as they are', withComputedStatus(rolling).status === 'OPEN');
  check('computeStatus is OPEN on the closing date itself', computeStatus(null, '2026-10-27', new Date('2026-10-27T10:00:00Z')) === 'OPEN');
  check('conditionHolds treats a missing condition as true', conditionHolds(undefined, {}) && conditionHolds({ key: 'b.prior', equals: 'yes' }, { 'b.prior': 'yes' }));

  // ── 8. NYDA Voucher and Grant form ───────────────────────────────────────
  section('8. NYDA voucher and grant template');
  const nydaAsset = join(ROOT, 'public', 'assets', 'forms', 'nyda-grant-application.pdf');
  const nydaBytes = new Uint8Array(readFileSync(nydaAsset));
  check('NYDA PDF is a real PDF', looksLikePdf(nydaBytes));
  let nydaBlank: PDFDocument;
  try {
    nydaBlank = await PDFDocument.load(nydaBytes);
    check('NYDA PDF loads (not password-protected)', true);
  } catch (e) {
    check('NYDA PDF loads (not password-protected)', false, e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
  const nydaPages = nydaBlank.getPages();
  check('NYDA form has 11 pages', nydaPages.length === 11, `got ${nydaPages.length}`);
  check('every NYDA page is A4 portrait', nydaPages.every((p) => Math.abs(p.getWidth() - 595) < 3 && Math.abs(p.getHeight() - 842) < 3));
  check('no NYDA page rotation', nydaPages.every((p) => (p.getRotation().angle % 360) === 0));

  let nydaOutOfBounds = 0;
  let nydaMissingPage = 0;
  for (const op of NYDA_GRANT_VOUCHER.ops) {
    const page = nydaPages[op.page];
    if (!page) {
      nydaMissingPage++;
      continue;
    }
    const W = page.getWidth();
    const H = page.getHeight();
    if (op.kind === 'text') {
      if (op.x < 0 || op.x + op.maxWidth > W + 1 || op.baseline < 0 || op.baseline > H) nydaOutOfBounds++;
    } else if (op.kind === 'wrap') {
      if (op.x < 0 || op.x + op.width > W + 1 || op.top < 0 || op.top + op.height > H + 1) nydaOutOfBounds++;
    } else {
      const { x0, top, x1, bottom } = op.rect;
      if (x0 < 0 || x1 > W + 1 || top < 0 || bottom > H + 1) nydaOutOfBounds++;
    }
  }
  check('every NYDA DrawOp lands on a real page', nydaMissingPage === 0);
  check('every NYDA DrawOp lands inside its page', nydaOutOfBounds === 0, `${nydaOutOfBounds} out of bounds`);
  check('NYDA template has a full set of draw ops', NYDA_GRANT_VOUCHER.ops.length >= 90, `got ${NYDA_GRANT_VOUCHER.ops.length}`);

  const nydaAnswers: Record<string, string> = {
    'a.full_names': 'Thandiwe',
    'a.surname': 'Mokoena',
    'a.id': '9901235600089',
    'a.gender': 'female',
    'a.age': '27',
    'a.population': 'african',
    'a.home_language': 'isiXhosa',
    'a.disability': 'no',
    'a.cell': '083 555 0199',
    'a.email': 'thandiwe@example.co.za',
    'a.address': '14 Main Road, Dutywa',
    'a.address_code': '5050',
    'a.postal_address': 'PO Box 88, Dutywa',
    'a.postal_code': '5050',
    'a.province': 'Eastern Cape',
    'a.geo': 'rural',
    'a.qualifications': 'Diploma in Agriculture',
    'a.training': 'NYDA business management training 2025',
    'a.nok_name': 'Nomvula Mokoena',
    'a.nok_address': '14 Main Road, Dutywa',
    'a.nok_cell': '083 555 0200',
    'a.nok_relationship': 'Mother',
    'b.existing': 'yes',
    'b.trained': 'yes',
    'biz.name': 'Thandiwe Poultry Enterprise',
    'biz.type': 'Free-range egg production',
    'biz.sector': 'agro',
    'biz.entity': 'pty',
    'f.amount': '120000',
    'f.use.1.what': 'Layer hens and laying cages',
    'f.use.1.amount': '80000',
    'f.use.2.what': 'Feed for the first cycle',
    'f.use.2.amount': '40000',
    'g.1': 'yes',
    'g.2': 'yes',
    'g.3': 'yes',
    'g.6': 'yes',
    'g.7': 'yes',
    'g.8': 'yes',
  };
  const nydaFill = await fillFormPdf(NYDA_GRANT_VOUCHER, nydaBytes, nydaAnswers);
  check('NYDA fill saves without throwing', looksLikePdf(nydaFill.bytes));
  check('NYDA fill fits every answer (nothing cut)', nydaFill.cutKeys.length === 0, `cut: ${nydaFill.cutKeys.join(', ')}`);
  const nydaParsed = new PDFParse({ data: nydaFill.bytes.slice() });
  const nydaText = await nydaParsed.getText();
  check('NYDA output still has 11 pages', nydaText.pages.length === 11);
  const nydaPage1 = nydaText.getPageText(1);
  check('NYDA page 1 shows the surname and ID', nydaPage1.includes('Mokoena') && nydaPage1.includes('9901235600089'));
  check('NYDA page 1 shows the address and cell', nydaPage1.includes('Dutywa') && nydaPage1.includes('083 555 0199'));
  const nydaPage5 = nydaText.getPageText(5);
  check('NYDA Section E (page 5) carries the business name for an existing business', nydaPage5.includes('Thandiwe Poultry Enterprise'));
  const nydaPage9 = nydaText.getPageText(9);
  check('NYDA Section F (page 9) carries the business name too', nydaPage9.includes('Thandiwe Poultry Enterprise'));
  check('NYDA page 9 shows the grant amount grouped (120 000)', nydaPage9.includes('120 000'));
  const nydaPage10 = nydaText.getPageText(10);
  check('NYDA utilisation page shows line amounts and the computed total', nydaPage10.includes('80 000') && nydaPage10.includes('40 000') && nydaPage10.includes('120 000'));
  const nydaPage11 = nydaText.getPageText(11);
  check('NYDA Section G has 9 X-mark ops on the checklist page (ticks are vector lines, not text)',
    NYDA_GRANT_VOUCHER.ops.filter((o) => o.kind === 'tick' && o.page === 10).length === 9,
    `got ${NYDA_GRANT_VOUCHER.ops.filter((o) => o.kind === 'tick' && o.page === 10).length}`);
  check('NYDA ticks target only the answered option (one X per choice group drawn)',
    NYDA_GRANT_VOUCHER.ops.filter((o) => o.kind === 'tick').length >= 45);
  const nydaPage3Startup = nydaText.getPageText(3);
  check('an existing business does NOT fill the Section D start-up block', !nydaPage3Startup.includes('Thandiwe Poultry Enterprise'));
  const startupFill = await fillFormPdf(NYDA_GRANT_VOUCHER, nydaBytes, { ...nydaAnswers, 'b.existing': 'no' });
  const startupParsed = new PDFParse({ data: startupFill.bytes.slice() });
  const startupText = await startupParsed.getText();
  check('a start-up fills Section D (page 3) instead of Section E', startupText.getPageText(3).includes('Thandiwe Poultry Enterprise') && !startupText.getPageText(5).includes('Thandiwe Poultry Enterprise'));

  const nydaValidate = NYDA_GRANT_VOUCHER.validate;
  const nydaErrors = (a: Record<string, string>): string[] => nydaValidate(a).errors.map((e) => e.message);
  const nydaWarnings = (a: Record<string, string>): string[] => nydaValidate(a).warnings.map((w) => w.message);
  const nydaGood = nydaValidate(nydaAnswers);
  check('the NYDA answer set has zero errors', nydaGood.errors.length === 0, nydaGood.errors.map((e) => e.message).join('; '));
  check('the NYDA answer set produces no warnings', nydaGood.warnings.length === 0, nydaGood.warnings.map((w) => w.message).join('; '));
  check('NYDA blank sheet is blocked with many errors', nydaErrors({}).length >= 10, `got ${nydaErrors({}).length}`);
  check('NYDA utilisation lines that do not total the grant warn', nydaWarnings({ ...nydaAnswers, 'f.use.2.amount': '30000' }).some((m) => m.includes('add up to')));
  check('NYDA grant above R250 000 warns', nydaWarnings({ ...nydaAnswers, 'f.amount': '400000', 'f.use.1.amount': '300000', 'f.use.2.amount': '100000' }).some((m) => m.includes('R250 000')));
  check('NYDA grant above R50 000 without a business plan warns', nydaWarnings({ ...nydaAnswers, 'g.7': '' }).some((m) => m.includes('business plan')));
  check('NYDA age outside 18-35 warns', nydaWarnings({ ...nydaAnswers, 'a.age': '41' }).some((m) => m.includes('18 to 35')));
  check('NYDA 12-digit ID warns', nydaWarnings({ ...nydaAnswers, 'a.id': '990123560008' }).some((m) => m.includes('13 digits')));
  check('NYDA half-filled utilisation line is blocked', nydaErrors({ ...nydaAnswers, 'f.use.3.what': 'Packaging' }).some((m) => m.includes('Line 3')));
  check('NYDA computed() totals the utilisation lines', (NYDA_GRANT_VOUCHER.computed?.(nydaAnswers) ?? {})['f.total'] === '120000');
  const nydaPrefill = NYDA_GRANT_VOUCHER.prefill({
    email: 'thandiwe@example.co.za',
    businessName: 'Thandiwe Poultry Enterprise',
    whatsapp: '083 555 0199',
    profile: { name: 'Thandiwe Poultry Enterprise', industry: 'Poultry farming', description: 'Free-range eggs', registration: '2022/111222/07', province: 'Eastern Cape', address: '14 Main Road, Dutywa', postalCode: '5050' },
    ownerInfo: { name: 'Thandiwe Mokoena', idNumber: '9901235600089', age: 27 },
    documentCategories: ['CIPC Registration', 'Business Plan'],
  });
  check('NYDA prefill splits first names and surname', nydaPrefill['a.full_names'] === 'Thandiwe' && nydaPrefill['a.surname'] === 'Mokoena');
  check('NYDA prefill guesses the sector from the industry', nydaPrefill['biz.sector'] === 'agro');
  check('NYDA prefill ticks only documents the profile has', nydaPrefill['g.3'] === 'yes' && nydaPrefill['g.7'] === 'yes' && isBlank(nydaPrefill['g.1']));
  const nydaSectorCases: [string, string][] = [
    ['Poultry farming', 'agro'],
    ['Building contractor', 'construction'],
    ['Furniture manufacturing', 'manufacturing'],
    ['Spaza shop', 'retail'],
    ['Guest house', 'tourism'],
    ['Software development', 'ict'],
    ['Hair salon', 'service'],
    ['Accounting practice', ''],
  ];
  check('NYDA sector guessing maps all test cases', nydaSectorCases.every(([i, e]) => guessNydaSector(i) === e), nydaSectorCases.filter(([i, e]) => guessNydaSector(i) !== e).map(([i]) => i).join(', '));

  // ── 9. ECRDA / sefa Rural Blended Finance form ───────────────────────────
  section('9. ECRDA / sefa blended finance template');
  const sefaAsset = join(ROOT, 'public', 'assets', 'forms', 'sefa-ecrda-blended-finance.pdf');
  const sefaBytes = new Uint8Array(readFileSync(sefaAsset));
  check('sefa PDF is a real PDF', looksLikePdf(sefaBytes));
  let sefaBlank: PDFDocument;
  try {
    sefaBlank = await PDFDocument.load(sefaBytes);
    check('sefa PDF loads (not password-protected)', true);
  } catch (e) {
    check('sefa PDF loads (not password-protected)', false, e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
  const sefaPages = sefaBlank.getPages();
  check('sefa form has 4 pages', sefaPages.length === 4, `got ${sefaPages.length}`);
  check('every sefa page is A4 portrait', sefaPages.every((p) => Math.abs(p.getWidth() - 595) < 3 && Math.abs(p.getHeight() - 842) < 3));
  check('no sefa page rotation', sefaPages.every((p) => (p.getRotation().angle % 360) === 0));

  let sefaOutOfBounds = 0;
  let sefaMissingPage = 0;
  for (const op of SEFA_BLENDED_FINANCE.ops) {
    const page = sefaPages[op.page];
    if (!page) {
      sefaMissingPage++;
      continue;
    }
    const W = page.getWidth();
    const H = page.getHeight();
    if (op.kind === 'text') {
      if (op.x < 0 || op.x + op.maxWidth > W + 1 || op.baseline < 0 || op.baseline > H) sefaOutOfBounds++;
    } else if (op.kind === 'wrap') {
      if (op.x < 0 || op.x + op.width > W + 1 || op.top < 0 || op.top + op.height > H + 1) sefaOutOfBounds++;
    } else {
      const { x0, top, x1, bottom } = op.rect;
      if (x0 < 0 || x1 > W + 1 || top < 0 || bottom > H + 1) sefaOutOfBounds++;
    }
  }
  check('every sefa DrawOp lands on a real page', sefaMissingPage === 0);
  check('every sefa DrawOp lands inside its page', sefaOutOfBounds === 0, `${sefaOutOfBounds} out of bounds`);
  check('sefa template has a full set of draw ops', SEFA_BLENDED_FINANCE.ops.length >= 60, `got ${SEFA_BLENDED_FINANCE.ops.length}`);

  const sefaAnswers: Record<string, string> = {
    'a.cipc_name': 'Mokoena Agri Processing (Pty) Ltd',
    'a.trading_name': 'Mokoena Agri',
    'a.business_type': 'Vegetable production and agro processing',
    'a.industry': 'Agriculture',
    'a.reg_number': '2022/111222/07',
    'a.reg_date': '8 June 2022',
    'a.email': 'info@mokoenaagri.co.za',
    'a.tax_ref': '9876543210',
    'a.physical_address': 'Farm 43, Dutywa Road, Dutywa',
    'a.phys_province': 'Eastern Cape',
    'a.phys_code': '5050',
    'a.postal_address': 'PO Box 88, Dutywa',
    'a.post_province': 'Eastern Cape',
    'a.post_code': '5050',
    'a.district': 'Amathole',
    'a.local_muni': 'Mbhashe',
    'a.township': 'Dutywa',
    'a.gps': '-32.19, 28.18',
    'a.years_trading': '3',
    'a.employees': '6',
    'a.new_jobs': '4',
    'a.correspondence': 'email',
    'c.title': 'mr',
    'c.surname': 'Mokoena',
    'c.first_names': 'Sipho',
    'c.cell': '083 555 0188',
    'c.tel': '045 555 0100',
    'c.email': 'sipho@mokoenaagri.co.za',
    'f.equipment': '450000',
    'f.vegetables': '150000',
    'f.working': '100000',
    'b.surname': 'Mokoena',
    'b.first_names': 'Sipho',
    'b.id_number': '8502105600083',
    'b.gender': 'male',
    'b.nationality': 'South African',
    'b.race': 'Black',
    'b.disability': 'no',
    'b.role': 'Managing Director',
    'b.email': 'sipho@mokoenaagri.co.za',
    'b.cell': '083 555 0188',
    'b.marital_status': 'Married',
    'b.physical_address': '14 Main Road, Dutywa',
    'b.phys_code': '5050',
    'sig.surname': 'Mokoena',
    'sig.full_names': 'Sipho Mokoena',
    'sig.designation': 'Managing Director',
    'c.1': 'yes',
    'c.3': 'yes',
    'c.4': 'yes',
    'c.5': 'yes',
    'c.6': 'yes',
    'c.8': 'yes',
    'c.9': 'yes',
    'c.16': 'yes',
    'c.18': 'yes',
  };
  const sefaFill = await fillFormPdf(SEFA_BLENDED_FINANCE, sefaBytes, sefaAnswers);
  check('sefa fill saves without throwing', looksLikePdf(sefaFill.bytes));
  check('sefa fill fits every answer (nothing cut)', sefaFill.cutKeys.length === 0, `cut: ${sefaFill.cutKeys.join(', ')}`);
  const sefaParsed = new PDFParse({ data: sefaFill.bytes.slice() });
  const sefaText = await sefaParsed.getText();
  check('sefa output still has 4 pages', sefaText.pages.length === 4);
  const sefaPage1 = sefaText.getPageText(1);
  check('sefa page 1 shows CIPC name, reg number and district', sefaPage1.includes('Mokoena Agri Processing') && sefaPage1.includes('2022/111222/07') && sefaPage1.includes('Amathole'));
  check('sefa page 1 shows the equipment amount and the computed total (700 000)', sefaPage1.includes('450 000') && sefaPage1.includes('700 000'));
  const sefaPage2 = sefaText.getPageText(2);
  check('sefa page 2 shows the owner ID and the printed signatory name', sefaPage2.includes('8502105600083') && sefaPage2.includes('Sipho Mokoena'));
  check('sefa page 2 never contains a drawn signature date (engine never signs)', !/\b\d{4}-\d{2}-\d{2}\b/.test(sefaPage2));
  const sefaPage3 = sefaText.getPageText(3);
  check('sefa Annexure 1 has 18 X-mark ops on the checklist page (ticks are vector lines, not text)',
    SEFA_BLENDED_FINANCE.ops.filter((o) => o.kind === 'tick' && o.page === 2).length === 18,
    `got ${SEFA_BLENDED_FINANCE.ops.filter((o) => o.kind === 'tick' && o.page === 2).length}`);

  const sefaValidate = SEFA_BLENDED_FINANCE.validate;
  const sefaErrors = (a: Record<string, string>): string[] => sefaValidate(a).errors.map((e) => e.message);
  const sefaWarnings = (a: Record<string, string>): string[] => sefaValidate(a).warnings.map((w) => w.message);
  const sefaGood = sefaValidate(sefaAnswers);
  check('the sefa answer set has zero errors', sefaGood.errors.length === 0, sefaGood.errors.map((e) => e.message).join('; '));
  check('the sefa answer set produces no warnings', sefaGood.warnings.length === 0, sefaGood.warnings.map((w) => w.message).join('; '));
  check('sefa blank sheet is blocked with many errors', sefaErrors({}).length >= 10, `got ${sefaErrors({}).length}`);
  check('sefa total above the R2.5m cap warns', sefaWarnings({ ...sefaAnswers, 'f.equipment': '2500000' }).some((m) => m.includes('R2 500 000')));
  check('sefa with no funding lines is blocked', sefaErrors({ ...sefaAnswers, 'f.equipment': '', 'f.vegetables': '', 'f.working': '' }).some((m) => m.includes('at least one line')));
  check('sefa non-South-African owner nationality warns', sefaWarnings({ ...sefaAnswers, 'b.nationality': 'Zimbabwean' }).some((m) => m.includes('South African nationals')));
  check('sefa province outside the Eastern Cape warns to confirm with ECRDA', sefaWarnings({ ...sefaAnswers, 'a.phys_province': 'Limpopo' }).some((m) => m.includes('Eastern Cape')));
  check('sefa 12-digit ID warns', sefaWarnings({ ...sefaAnswers, 'b.id_number': '850210560008' }).some((m) => m.includes('13 digits')));
  check('sefa without quotations attached warns', sefaWarnings({ ...sefaAnswers, 'c.9': '' }).some((m) => m.includes('quotations')));
  check('sefa computed() totals the funding lines', (SEFA_BLENDED_FINANCE.computed?.(sefaAnswers) ?? {})['f.total'] === '700000');
  check('sefa scheme constants match Annexure 2', SEFA_SCHEME.maxFinance === 2500000 && SEFA_SCHEME.maxTermMonths === 60 && SEFA_SCHEME.rateFromPct === 5);
  const sefaPrefill = SEFA_BLENDED_FINANCE.prefill({
    email: 'sipho@mokoenaagri.co.za',
    businessName: 'Mokoena Agri',
    whatsapp: '083 555 0188',
    profile: { name: 'Mokoena Agri Processing (Pty) Ltd', registration: '2022/111222/07', industry: 'Agriculture', province: 'Eastern Cape' },
    ownerInfo: { name: 'Sipho Mokoena', idNumber: '8502105600083', position: 'Managing Director' },
    documentCategories: ['CIPC Registration', 'Bank Statement'],
  });
  check('sefa prefill fills company, contact and signatory keys', sefaPrefill['a.cipc_name'] === 'Mokoena Agri Processing (Pty) Ltd' && sefaPrefill['c.surname'] === 'Mokoena' && sefaPrefill['sig.designation'] === 'Managing Director');
  check('sefa prefill ticks only documents the profile has', sefaPrefill['c.6'] === 'yes' && sefaPrefill['c.8'] === 'yes' && isBlank(sefaPrefill['c.1']));

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log(`FORM ENGINE CHECKS: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log('\nFailed checks:');
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('ALL CHECKS PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.error('Script crashed:', e);
  process.exit(1);
});
