// services/formTemplates/nydaGrantVoucher.ts
/**
 * NYDA Voucher and Grant Client Application Form (11 pages, "Grant - Voucher
 * 17 Feb 2016 Draft No 1" - the current form published on nyda.gov.za).
 *
 * Every position below was measured from the official PDF
 * (public/assets/forms/nyda-grant-application.pdf), in PDF points from the
 * TOP-LEFT of an A4 page. The form is a bordered table: labels sit in a left
 * cell (x 28-117) and answers go in the open cell to its right; option words
 * (Female, African, Yes, ...) get a small X drawn in the gap beside them.
 *
 * Scope: Section A (client details), Section B (the two Yes/No questions),
 * the business block of Section D (start-up) and/or E (existing) and F
 * (grants), the grant utilisation table (page 10) and the Section G document
 * checklist. Deliberately NOT filled: signatures, dates, branch-use boxes,
 * the job-creation grid, the Section E survey questions and the
 * income/expense and assets tables - see neverFilled.
 *
 * If NYDA publishes a new version of this form the positions must be
 * re-measured: do not reuse this template for another revision.
 */

import { conditionHolds, isBlank, toInt } from '../formModel';
import type {
  AnswerMap,
  Condition,
  DrawOp,
  FormSection,
  FormTemplate,
  Issue,
  ProfileSource,
  Question,
  Rect,
  ValidationResult,
  ValueFormat,
} from '../formModel';

// ─── Page indexes (0-based) ──────────────────────────────────────────────────
const P_CLIENT = 0; // Section A: client details
const P_CONTACT = 1; // postal address, next of kin, Section B yes/no
const P_STARTUP = 2; // Section D business block (start-up applicants)
const P_EXISTING = 4; // Section E business block (existing businesses)
const P_GRANT = 8; // Section F: grant business block + amount
const P_UTILISATION = 9; // utilisation lines 1-5 + total
const P_CHECKLIST = 10; // Section G supporting documents

// ─── Option lists printed on the form ────────────────────────────────────────

const GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

const POPULATION_GROUPS = [
  { value: 'african', label: 'African' },
  { value: 'white', label: 'White' },
  { value: 'indian', label: 'Indian' },
  { value: 'coloured', label: 'Coloured' },
];

const SECTORS: { value: string; label: string }[] = [
  { value: 'agro', label: 'Agro Processing' },
  { value: 'construction', label: 'Construction' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'retail', label: 'Retail' },
  { value: 'service', label: 'Service' },
  { value: 'ict', label: 'Information Communication Technology' },
  { value: 'tourism', label: 'Tourism' },
  { value: 'other', label: 'Other (specify)' },
];

const LEGAL_ENTITIES = [
  { value: 'cc', label: 'Close Corporation' },
  { value: 'pty', label: 'Private Company (Pty)' },
  { value: 'coops', label: 'Co-operative' },
  { value: 'sole', label: 'Sole Proprietor' },
  { value: 'other', label: 'Other (specify)' },
];

const yesNo = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/** Section G documents: [key, label, tick-x0, tick-top] - the X goes beside the printed item, on its line. */
const CHECKLIST: [string, string, number, number][] = [
  ['g.1', 'Certified Identity document copy (stamp not older than 3 months)', 348, 202.3],
  ['g.2', 'Proof of Residence', 154, 217.3],
  ['g.3', 'Copy of Company Registration from CIPC (if registered)', 297, 232.6],
  ['g.4', 'Company Profile', 145, 247.8],
  ['g.5', 'Detailed list of the current employees', 231, 262.8],
  ['g.6', 'Personal or Business Bank Statement', 296, 278.1],
  ['g.7', 'Business Plan (needed for grants above R50 000)', 250, 293.1],
  ['g.8', 'Quotations (needed when applying for a grant)', 208, 308.4],
  ['g.9', 'Any other document that might be required', 257, 323.4],
];

// ─── Drawing instructions ────────────────────────────────────────────────────

type TextExtra = { size?: number; minSize?: number; format?: ValueFormat; when?: Condition };
const text = (page: number, key: string, x: number, baseline: number, maxWidth: number, extra: TextExtra = {}): DrawOp => ({
  kind: 'text',
  page,
  key,
  x,
  baseline,
  maxWidth,
  ...extra,
});
/** Small X drawn in the open space beside a printed option word. */
const tick = (page: number, key: string, equals: string, x0: number, top: number, size = 10, when?: Condition): DrawOp => ({
  kind: 'tick',
  page,
  key,
  equals,
  rect: { x0, top, x1: x0 + size, bottom: top + size },
  ...(when ? { when } : {}),
});

/** One sector list ("Mark with an X"). Same X column on every page it appears.
 *  `top` is the vertical centre of the sector row; the 12pt X is centred on it. */
function sectorTicks(page: number, key: string, rows: { value: string; top: number }[], when?: Condition): DrawOp[] {
  return rows.map((r) => tick(page, key, r.value, 365, r.top - 6, 12, when));
}

function buildOps(): DrawOp[] {
  const ops: DrawOp[] = [];

  // Section A (page 1): answer cell starts right of the x=117 divider.
  ops.push(
    text(P_CLIENT, 'a.full_names', 120, 500.3, 413),
    text(P_CLIENT, 'a.surname', 120, 519.0, 413),
    text(P_CLIENT, 'a.id', 120, 537.8, 413),
    tick(P_CLIENT, 'a.gender', 'female', 158, 548),
    tick(P_CLIENT, 'a.gender', 'male', 283, 548),
    text(P_CLIENT, 'a.age', 428, 556.5, 105),
    tick(P_CLIENT, 'a.population', 'african', 156, 599.7),
    tick(P_CLIENT, 'a.population', 'white', 217, 599.7),
    tick(P_CLIENT, 'a.population', 'indian', 286, 599.7),
    tick(P_CLIENT, 'a.population', 'coloured', 340.5, 599.7),
    text(P_CLIENT, 'a.home_language', 428, 608.3, 105),
    tick(P_CLIENT, 'a.disability', 'no', 138, 651.5),
    tick(P_CLIENT, 'a.disability', 'yes', 170, 651.5),
    text(P_CLIENT, 'a.disability_details', 230, 696, 300, { when: { key: 'a.disability', equals: 'yes' } }),
    text(P_CLIENT, 'a.telephone', 120, 715.5, 128),
    text(P_CLIENT, 'a.fax', 300, 715.5, 233),
    text(P_CLIENT, 'a.cell', 120, 734.5, 128),
    text(P_CLIENT, 'a.email', 300, 734.5, 233),
    text(P_CLIENT, 'a.address', 120, 753.3, 413, { size: 9, minSize: 6.5 }),
    text(P_CLIENT, 'a.address_code', 454, 772.0, 80)
  );

  // Page 2: postal address block + Section B.
  ops.push(
    text(P_CONTACT, 'a.postal_address', 120, 59.5, 413, { size: 9, minSize: 6.5 }),
    text(P_CONTACT, 'a.postal_code', 454, 78.3, 80),
    text(P_CONTACT, 'a.province', 120, 97.0, 413),
    tick(P_CONTACT, 'a.geo', 'urban', 152, 107.3),
    tick(P_CONTACT, 'a.geo', 'rural', 364, 107.3),
    text(P_CONTACT, 'a.qualifications', 120, 139.7, 413),
    text(P_CONTACT, 'a.training', 120, 177.5, 413),
    text(P_CONTACT, 'a.nok_name', 120, 201.5, 413),
    text(P_CONTACT, 'a.nok_address', 120, 220.5, 413, { size: 9, minSize: 6.5 }),
    text(P_CONTACT, 'a.nok_cell', 120, 239.3, 413),
    text(P_CONTACT, 'a.nok_relationship', 120, 258.0, 413),
    tick(P_CONTACT, 'b.existing', 'yes', 413, 308.1),
    tick(P_CONTACT, 'b.existing', 'no', 496, 308.1),
    tick(P_CONTACT, 'b.trained', 'yes', 413, 322.9),
    tick(P_CONTACT, 'b.trained', 'no', 496, 322.9)
  );

  // Section D business block (page 3) - only for start-up applicants.
  const startupWhen: Condition = { key: 'b.existing', equals: 'no' };
  ops.push(
    text(P_STARTUP, 'biz.name', 126, 414.2, 395, { when: startupWhen }),
    text(P_STARTUP, 'biz.type', 133, 432.5, 393, { when: startupWhen }),
    ...sectorTicks(
      P_STARTUP,
      'biz.sector',
      [
        { value: 'agro', top: 496.7 },
        { value: 'construction', top: 515.5 },
        { value: 'manufacturing', top: 534.2 },
        { value: 'retail', top: 553.2 },
        { value: 'service', top: 572.0 },
        { value: 'ict', top: 590.7 },
        { value: 'tourism', top: 609.5 },
        { value: 'other', top: 628.5 },
      ],
      startupWhen
    ),
    tick(P_STARTUP, 'biz.entity', 'cc', 137, 716.3, 10, startupWhen),
    tick(P_STARTUP, 'biz.entity', 'pty', 221, 716.3, 10, startupWhen),
    tick(P_STARTUP, 'biz.entity', 'coops', 288, 716.3, 10, startupWhen),
    tick(P_STARTUP, 'biz.entity', 'sole', 385, 716.3, 10, startupWhen),
    text(P_STARTUP, 'biz.entity_other_d', 60, 768.5, 445, { when: startupWhen })
  );

  // Section E business block (page 5) - only for existing businesses.
  const existingWhen: Condition = { key: 'b.existing', equals: 'yes' };
  ops.push(
    text(P_EXISTING, 'biz.name', 110, 133.0, 412, { when: existingWhen }),
    text(P_EXISTING, 'biz.type', 115, 151.3, 408, { when: existingWhen }),
    ...sectorTicks(
      P_EXISTING,
      'biz.sector',
      [
        { value: 'agro', top: 210.4 },
        { value: 'construction', top: 229.4 },
        { value: 'manufacturing', top: 248.1 },
        { value: 'retail', top: 266.9 },
        { value: 'service', top: 285.6 },
        { value: 'ict', top: 304.7 },
        { value: 'tourism', top: 323.4 },
        { value: 'other', top: 342.2 },
      ],
      existingWhen
    ),
    tick(P_EXISTING, 'biz.entity', 'cc', 137, 429.9, 10, existingWhen),
    tick(P_EXISTING, 'biz.entity', 'pty', 185, 429.9, 10, existingWhen),
    tick(P_EXISTING, 'biz.entity', 'coops', 230, 429.9, 10, existingWhen),
    tick(P_EXISTING, 'biz.entity', 'sole', 307, 429.9, 10, existingWhen),
    text(P_EXISTING, 'biz.entity_other_e', 90, 467.5, 440, { when: existingWhen })
  );

  // Section F (page 9) - the grant block, always filled.
  ops.push(
    text(P_GRANT, 'biz.name', 126, 366.0, 395),
    text(P_GRANT, 'biz.type', 133, 384.2, 393),
    ...sectorTicks(P_GRANT, 'biz.sector', [
      { value: 'agro', top: 448.4 },
      { value: 'construction', top: 467.2 },
      { value: 'manufacturing', top: 486.0 },
      { value: 'retail', top: 504.7 },
      { value: 'service', top: 523.7 },
      { value: 'ict', top: 542.5 },
      { value: 'tourism', top: 561.2 },
      { value: 'other', top: 580.0 },
    ]),
    tick(P_GRANT, 'biz.entity', 'cc', 137, 645.8, 10),
    tick(P_GRANT, 'biz.entity', 'pty', 185, 645.8, 10),
    tick(P_GRANT, 'biz.entity', 'coops', 230, 645.8, 10),
    tick(P_GRANT, 'biz.entity', 'sole', 305, 645.8, 10),
    text(P_GRANT, 'biz.entity_other', 60, 697.5, 445),
    text(P_GRANT, 'f.amount', 193, 757.0, 340, { format: 'amount' })
  );

  // Utilisation table (page 10): five description+amount rows and a computed total.
  const utilRows: [number, number][] = [
    [1, 59.0],
    [2, 74.0],
    [3, 89.0],
    [4, 104.3],
    [5, 119.3],
  ];
  for (const [n, baseline] of utilRows) {
    ops.push(
      text(P_UTILISATION, `f.use.${n}.what`, 70, baseline, 370, { size: 9, minSize: 6.5 }),
      text(P_UTILISATION, `f.use.${n}.amount`, 450, baseline, 85, { format: 'amount' })
    );
  }
  ops.push(text(P_UTILISATION, 'f.total', 450, 134.3, 85, { format: 'amount' }));

  // Section G (page 11): an X beside each document the applicant is attaching.
  for (const [key, , x, top] of CHECKLIST) {
    ops.push(tick(P_CHECKLIST, key, 'yes', x, top, 10));
  }
  return ops;
}

// ─── Questions the wizard asks ───────────────────────────────────────────────

const q = (key: string, label: string, type: Question['type'], extra: Partial<Question> = {}): Question => ({ key, label, type, ...extra });

const SECTIONS: FormSection[] = [
  {
    id: 'a',
    title: 'A. Your details',
    questions: [
      q('a.full_names', 'Your first names (as on your ID)', 'text', { required: true }),
      q('a.surname', 'Your surname', 'text', { required: true }),
      q('a.id', 'Your RSA ID number', 'number', { required: true, inputMode: 'numeric', maxLength: 13 }),
      q('a.gender', 'Gender', 'choice', { required: true, options: GENDERS }),
      q('a.age', 'Your age', 'number', { required: true, inputMode: 'numeric', maxLength: 3 }),
      q('a.population', 'Population group', 'choice', { required: true, options: POPULATION_GROUPS }),
      q('a.home_language', 'Home language', 'text', { required: true }),
      q('a.disability', 'Do you have a disability?', 'choice', { required: true, options: yesNo }),
      q('a.disability_details', 'Describe the disability', 'text', { showIf: { key: 'a.disability', equals: 'yes' } }),
      q('a.telephone', 'Telephone number (optional)', 'text', { inputMode: 'tel' }),
      q('a.fax', 'Fax number (optional)', 'text', { inputMode: 'tel' }),
      q('a.cell', 'Cell number', 'text', { required: true, inputMode: 'tel' }),
      q('a.email', 'E-mail address', 'text', { required: true, inputMode: 'email' }),
      q('a.address', 'Physical address', 'text', { required: true }),
      q('a.address_code', 'Postal code for the physical address', 'number', { required: true, inputMode: 'numeric', maxLength: 4 }),
      q('a.postal_address', 'Postal address (if different)', 'text'),
      q('a.postal_code', 'Postal code for the postal address', 'number', { inputMode: 'numeric', maxLength: 4 }),
      q('a.province', 'Province', 'text', { required: true }),
      q('a.geo', 'Geographic type', 'choice', { required: true, options: [{ value: 'urban', label: 'Urban' }, { value: 'rural', label: 'Rural' }] }),
      q('a.qualifications', 'Formal qualifications', 'text'),
      q('a.training', 'Training courses attended', 'text'),
    ],
  },
  {
    id: 'kin',
    title: 'Next of kin',
    questions: [
      q('a.nok_name', 'Next of kin: name and surname', 'text', { required: true }),
      q('a.nok_address', 'Next of kin: physical address', 'text', { required: true }),
      q('a.nok_cell', 'Next of kin: cell number', 'text', { required: true, inputMode: 'tel' }),
      q('a.nok_relationship', 'Next of kin: relationship to you', 'text', { required: true }),
    ],
  },
  {
    id: 'b',
    title: 'B. Entrepreneurial status',
    intro: 'Section B is compulsory for everyone. The answer decides which business section the form fills for you.',
    questions: [
      q('b.existing', 'Do you have an existing business that is currently in operation?', 'choice', {
        required: true,
        options: yesNo,
        help: 'Yes fills the Section E business block; No fills the Section D start-up block. Section F (the grant) is always filled.',
      }),
      q('b.trained', 'Have you ever received any Entrepreneurship Development Training?', 'choice', { required: true, options: yesNo }),
    ],
  },
  {
    id: 'biz',
    title: 'Your business (Sections D / E / F)',
    intro: 'Asked once, written into the sections that apply to your application.',
    questions: [
      q('biz.name', 'Business name', 'text', { required: true }),
      q('biz.type', 'Type of business (what it does)', 'text', { required: true }),
      q('biz.sector', 'Sector', 'choice', { required: true, options: SECTORS }),
      q('biz.sector_other', 'Other sector: specify', 'text', { showIf: { key: 'biz.sector', equals: 'other' }, required: true }),
      q('biz.entity', 'Legal entity', 'choice', { required: true, options: LEGAL_ENTITIES }),
      q('biz.entity_other', 'Other legal entity: specify', 'text', { showIf: { key: 'biz.entity', equals: 'other' }, required: true }),
    ],
  },
  {
    id: 'f',
    title: 'F. The grant you are asking for',
    intro: 'Whole rand only (no cents). The form pays suppliers directly against quotations.',
    questions: [
      q('f.amount', 'Grant amount required (rand)', 'number', { required: true, inputMode: 'numeric', maxLength: 9 }),
      q('f.use.1.what', 'Use of funds 1: what you will buy', 'text'),
      q('f.use.1.amount', 'Use of funds 1: amount (rand)', 'number', { inputMode: 'numeric', maxLength: 9 }),
      q('f.use.2.what', 'Use of funds 2: what you will buy', 'text'),
      q('f.use.2.amount', 'Use of funds 2: amount (rand)', 'number', { inputMode: 'numeric', maxLength: 9 }),
      q('f.use.3.what', 'Use of funds 3: what you will buy', 'text'),
      q('f.use.3.amount', 'Use of funds 3: amount (rand)', 'number', { inputMode: 'numeric', maxLength: 9 }),
      q('f.use.4.what', 'Use of funds 4: what you will buy', 'text'),
      q('f.use.4.amount', 'Use of funds 4: amount (rand)', 'number', { inputMode: 'numeric', maxLength: 9 }),
      q('f.use.5.what', 'Use of funds 5: what you will buy', 'text'),
      q('f.use.5.amount', 'Use of funds 5: amount (rand)', 'number', { inputMode: 'numeric', maxLength: 9 }),
    ],
  },
  {
    id: 'g',
    title: 'G. Documents you are attaching',
    intro: 'Tick only what you will really hand in. Each tick puts an X beside that item on the form.',
    questions: CHECKLIST.map(([key, label]) => q(key, label, 'check')),
  },
];

const LABELS: Record<string, string> = {};
for (const s of SECTIONS) {
  for (const question of s.questions) LABELS[question.key] = question.label;
}
export const labelFor = (key: string): string => LABELS[key] ?? key;

// ─── Prefill from the applicant's own profile ────────────────────────────────

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const digitsOnly = (v: string): string => v.replace(/\D/g, '');

/** A suggestion only: the applicant confirms or changes it in the wizard. */
export function guessSector(industry: string): string {
  const i = industry.toLowerCase();
  const rules: [RegExp, string][] = [
    [/agro|farm|crop|food process|juice|packhouse|abattoir/, 'agro'],
    [/construct|building|contractor|renovat/, 'construction'],
    [/manufactur|factory|fabricat|production|sewing|clothing|furniture|metal work|welding/, 'manufacturing'],
    [/retail|shop|spaza|store|trading|wholesale|butchery|baker/, 'retail'],
    [/touris|hospitality|hotel|lodge|guest ?house|bnb|restaurant|catering|travel/, 'tourism'],
    [/software|digital|ict|information|technolog|computer|internet|app\b|web/, 'ict'],
    [/hair|salon|cleaning|transport|taxi|logistic|repair|mechanic|plumb|electr|service/, 'service'],
  ];
  for (const [re, value] of rules) if (re.test(i)) return value;
  return '';
}

function prefill(src: ProfileSource): AnswerMap {
  const p = src.profile ?? {};
  const o = src.ownerInfo ?? {};
  const a: AnswerMap = {};
  const set = (key: string, value: string) => {
    if (value) a[key] = value;
  };
  const fullName = str(o.name);
  const parts = fullName.split(/\s+/).filter(Boolean);
  const id = digitsOnly(str(o.idNumber));
  set('a.full_names', parts.slice(0, -1).join(' ') || fullName);
  set('a.surname', parts.length > 1 ? parts[parts.length - 1] : '');
  set('a.id', id);
  set('a.age', digitsOnly(str(o.age)));
  set('a.cell', str(p.whatsapp) || str(src.whatsapp));
  set('a.email', src.email);
  set('a.address', str(p.address) || str(o.address));
  set('a.address_code', digitsOnly(str(p.postalCode)).slice(0, 4));
  set('a.province', str(p.province));
  set('biz.name', str(p.name) || src.businessName);
  set('biz.type', str(p.description).slice(0, 80));
  set('biz.sector', guessSector(str(p.industry)));
  const cats = src.documentCategories ?? [];
  if (cats.includes('Certified ID Copy')) set('g.1', 'yes');
  if (cats.includes('Proof of Residence') || cats.includes('Proof of Address')) set('g.2', 'yes');
  if (cats.includes('CIPC Registration')) set('g.3', 'yes');
  if (cats.includes('Bank Confirmation Letter') || cats.includes('Bank Statement')) set('g.6', 'yes');
  if (cats.includes('Business Plan')) set('g.7', 'yes');
  if (cats.includes('Quotations')) set('g.8', 'yes');
  return a;
}

// ─── Checks before a PDF can be produced ─────────────────────────────────────

const REQUIRED_KEYS = SECTIONS.flatMap((s) =>
  s.questions
    .filter((x) => x.required)
    .map((x) => ({ key: x.key, showIf: x.showIf }))
);

function validate(a: AnswerMap): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (key: string, message: string) => errors.push({ key, message });
  const warn = (message: string, key?: string) => warnings.push({ key, message });

  for (const { key, showIf } of REQUIRED_KEYS) {
    // A question hidden behind a condition ("Other: specify") is only
    // required when that condition holds.
    if (!conditionHolds(showIf, a)) continue;
    if (isBlank(a[key])) err(key, `Add: ${labelFor(key)}`);
  }

  // The grant programme's own rules (printed on the NYDA Grant Programme page, not on this form).
  const amount = toInt(a['f.amount']);
  if (amount > 0 && (amount < 1000 || amount > 250000)) {
    warn('NYDA grants run from R1 000 to R250 000. Confirm your amount with the branch before submitting.', 'f.amount');
  }

  // Utilisation lines.
  const lines = [1, 2, 3, 4, 5].map((n) => toInt(a[`f.use.${n}.amount`]));
  const total = lines.reduce((x, y) => x + y, 0);
  const filled = [1, 2, 3, 4, 5].filter((n) => !isBlank(a[`f.use.${n}.amount`]) || !isBlank(a[`f.use.${n}.what`]));
  if (filled.length === 0) err('f.use.1.what', 'Say how the grant will be used (at least one line of the utilisation table).');
  for (const n of filled) {
    if (isBlank(a[`f.use.${n}.what`])) err(`f.use.${n}.what`, `Line ${n}: say what the money will buy.`);
    if (toInt(a[`f.use.${n}.amount`]) === 0) err(`f.use.${n}.amount`, `Line ${n}: give the amount.`);
  }
  if (amount > 0 && total > 0 && total !== amount) {
    warn(`The utilisation lines add up to R${total.toLocaleString('en-ZA').replace(/\u00A0/g, ' ')}, but you are asking for R${amount.toLocaleString('en-ZA').replace(/\u00A0/g, ' ')}. They should match.`, 'f.use.1.amount');
  }

  // Documents the form itself links to the grant.
  if (amount > 50000 && a['g.7'] !== 'yes') warn('A grant above R50 000 needs a business plan (item 7 of the checklist).', 'g.7');
  if (amount > 0 && a['g.8'] !== 'yes') warn('Grants are paid to suppliers against quotations, so attach quotations (item 8 of the checklist).', 'g.8');

  // Eligibility hints.
  const age = toInt(a['a.age']);
  if (age > 0 && (age < 18 || age > 35)) warn('The NYDA grant is for young people aged 18 to 35.', 'a.age');
  const id = digitsOnly(a['a.id'] ?? '');
  if (id && id.length !== 13) warn('A South African ID number has 13 digits.', 'a.id');

  return { errors, warnings };
}

function computed(a: AnswerMap): AnswerMap {
  const out: AnswerMap = {};
  const total = [1, 2, 3, 4, 5].reduce((sum, n) => sum + toInt(a[`f.use.${n}.amount`]), 0);
  if (total > 0) out['f.total'] = String(total);
  // A DrawOp carries at most one condition, so the "other entity" line is split
  // per section: the same answer, gated here by the applicant's status.
  if (a['biz.entity'] === 'other') {
    const other = a['biz.entity_other'] ?? '';
    if (a['b.existing'] === 'no') out['biz.entity_other_d'] = other;
    if (a['b.existing'] === 'yes') out['biz.entity_other_e'] = other;
  }
  return out;
}

// ─── The template ────────────────────────────────────────────────────────────

export const NYDA_GRANT_VOUCHER: FormTemplate = {
  id: 'nyda-grant-voucher-2016',
  title: 'NYDA Voucher and Grant Client Application Form',
  assetPath: '/assets/forms/nyda-grant-application.pdf',
  matches: (o) => {
    if (!/nyda|national youth development agency/i.test(o.issuer_name)) return false;
    return /grant|micro finance|voucher/i.test(o.programme_name);
  },
  intro: [
    'This fills the official NYDA Voucher and Grant Client Application Form from your answers, here in your browser. Nothing you type is sent to us or to an AI.',
    'NYDA also has an online portal (erp.nyda.gov.za). This paper form is what branches hand you after the pre-assessment, so print it, sign it and hand it in at your nearest NYDA branch or district office with certified copies.',
  ],
  rules: [
    'South African citizen aged 18 to 35, living in South Africa.',
    'The business must be 100% youth owned (formal or informal).',
    'Grants run from R1 000 to R250 000 and are paid to suppliers against quotations, not to you in cash.',
    'You must have the skills or experience to run the business, or be willing to attend business management training.',
    'A business plan is required for grants above R50 000.',
  ],
  neverFilled: [
    'The client signature and date on the declaration page - those are yours alone',
    'Branch-use boxes: Branch Name, Date of Application, GR no / BCS no and the Service/s Required list',
    'The job creation grid on page 2 (Before/After Funding by race, gender, disability and age) - fill it by hand',
    'The Section E survey questions (pages 6-9: how long trading, turnover band, premises, employees, skills ratings)',
    'The ownership tables in Sections D and E, and the income/expense and assets tables (pages 10-12)',
    'Anything you leave blank here stays blank on the form',
  ],
  sections: SECTIONS,
  ops: buildOps(),
  prefill,
  validate,
  computed,
};

export { SECTIONS as NYDA_SECTIONS, CHECKLIST as NYDA_CHECKLIST, SECTORS as NYDA_SECTORS };
