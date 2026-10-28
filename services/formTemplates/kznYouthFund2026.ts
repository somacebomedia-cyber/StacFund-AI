// services/formTemplates/kznYouthFund2026.ts
/**
 * KwaZulu-Natal Youth Empowerment Fund, Funding Application Form 2026/27 (8 pages).
 *
 * Every position below was measured from the official PDF
 * (public/assets/forms/kzn-youth-fund-2026-27.pdf), in PDF points from the
 * TOP-LEFT of an A4 page. If the Office of the Premier publishes a new version
 * of the form, the positions must be re-measured: do not reuse this template
 * for another year (matches() only accepts the 2026/27 window).
 *
 * Deliberately NOT filled: the signature and date columns, the YES/NO box, and
 * "Signature of applicant / Date" (page 4). Those are the applicant's own act.
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
  RowGroup,
  ValidationResult,
  ValueFormat,
} from '../formModel';

// ─── Page indexes (0-based) ──────────────────────────────────────────────────
const P_FRONT = 0; // Sections A and B
const P_FUNDING = 1; // utilisation, jobs, past funding
const P_SECTOR = 2; // Sections C and D
const P_DECLARATION = 3; // Section F
const P_CHECKLIST = 7; // Section G

// ─── Threshold rules printed on the form ─────────────────────────────────────
export const THRESHOLDS = {
  '1': { name: 'Threshold 1', who: 'Informal traders / start-ups', min: 1000, max: 100000, jobs: 2 },
  '2': { name: 'Threshold 2', who: 'Emerging and growing businesses', min: 100001, max: 500000, jobs: 4 },
  '3': { name: 'Threshold 3', who: 'Growth and scale-up businesses', min: 500001, max: 2000000, jobs: 10 },
} as const;

type ThresholdKey = keyof typeof THRESHOLDS;
const isThreshold = (v: string | undefined): v is ThresholdKey => v === '1' || v === '2' || v === '3';

const SECTORS: { value: string; label: string; rect: Rect }[] = [
  { value: 'tourism', label: 'Tourism & Hospitality', rect: { x0: 39.7, top: 77.0, x1: 148.3, bottom: 89.0 } },
  { value: 'manufacturing', label: 'Manufacturing', rect: { x0: 315.6, top: 77.0, x1: 389.7, bottom: 89.0 } },
  { value: 'green', label: 'Green Economy', rect: { x0: 39.7, top: 107.7, x1: 118.5, bottom: 119.7 } },
  { value: 'blue', label: 'Blue Economy', rect: { x0: 315.6, top: 107.7, x1: 386.2, bottom: 119.7 } },
  { value: 'agriculture', label: 'Agriculture and Agribusiness', rect: { x0: 39.7, top: 138.3, x1: 182.1, bottom: 150.3 } },
  { value: 'aquaculture', label: 'Aquaculture Development', rect: { x0: 315.6, top: 138.3, x1: 447.3, bottom: 150.3 } },
  { value: 'science', label: 'Science, Technology and Innovation', rect: { x0: 39.7, top: 168.9, x1: 218.2, bottom: 180.9 } },
  { value: 'retail', label: 'Retail', rect: { x0: 315.6, top: 168.9, x1: 344.4, bottom: 180.9 } },
  { value: 'mining', label: 'Mining and Mineral Beneficiation', rect: { x0: 39.7, top: 199.5, x1: 206.4, bottom: 211.5 } },
  { value: 'other', label: 'Other', rect: { x0: 315.6, top: 199.5, x1: 344.7, bottom: 211.5 } },
];

/** Checklist rows on page 8: [key, label, row top, row bottom]. The X goes in the right-hand column. */
const CHECKLIST: [string, string, number, number][] = [
  ['g.1', 'The application form is fully completed', 159, 183],
  ['g.2', 'Proof of CIPC registration / registration certificate', 183, 214],
  ['g.3', 'Certified ID copies of shareholders, directors, executives, trustees or members', 214, 251],
  ['g.4', 'Proof of residential address', 251, 288],
  ['g.5', 'CVs of shareholders, directors, executives, trustees or members', 288, 316],
  ['g.6', 'Proof of registration with SARS / SARS compliance status PIN', 316, 349],
  ['g.7', 'B-BBEE certificate', 349, 374],
  ['g.8', 'Completed funding application form and the attachments listed for your threshold', 374, 402],
  ['g.9', 'Business plan (with the sections below)', 402, 434],
  ['g.bp.a', '(a) Business description, history, location, key suppliers', 434, 478],
  ['g.bp.b', '(b) Analysis of market, customers and competitors', 478, 521],
  ['g.bp.c', '(c) Analysis of production plan and processes', 521, 565],
  ['g.bp.d', '(d) Human resources (organogram and CVs of key people)', 565, 609],
  ['g.bp.e', '(e) Marketing and sales plan', 609, 653],
  ['g.bp.f', '(f) Capital expenditure plan (machinery and equipment, and their costs)', 653, 697],
  ['g.bp.g', '(g) 3-year financial forecast: revenue, costs, profit (required for Threshold 3)', 697, 740],
  ['g.bp.h', '(h) Unique selling proposition: why your business is different and will succeed', 740, 784],
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

function buildOps(): DrawOp[] {
  const ops: DrawOp[] = [];

  // Section A (page 1): values sit to the right of each printed label, on the label's baseline.
  ops.push(
    text(P_FRONT, 'a.business_name', 227, 207.2, 338),
    text(P_FRONT, 'a.applicant_name', 212, 232.7, 353),
    text(P_FRONT, 'a.age', 141, 259.4, 100),
    text(P_FRONT, 'a.cipc', 246, 286.3, 319),
    text(P_FRONT, 'a.role', 211, 313.1, 354),
    text(P_FRONT, 'a.id', 236, 339.9, 329),
    text(P_FRONT, 'a.email', 129, 366.7, 436),
    text(P_FRONT, 'a.tel', 61, 393.5, 148),
    text(P_FRONT, 'a.cell', 248, 393.5, 148),
    text(P_FRONT, 'a.alt', 476, 393.5, 89),
    text(P_FRONT, 'a.address', 290, 420.3, 275, { size: 9, minSize: 6.5 }),
    text(P_FRONT, 'a.city', 151, 447.1, 142),
    text(P_FRONT, 'a.district', 352, 447.1, 213),
    text(P_FRONT, 'a.ward', 337, 458.5, 228),
    text(P_FRONT, 'a.province', 95, 473.9, 198),
    text(P_FRONT, 'a.postal', 378, 473.9, 187)
  );

  // Section B (page 1): threshold boxes, grant amount, reason.
  ops.push(
    { kind: 'tick', page: P_FRONT, key: 'b.threshold', equals: '1', rect: { x0: 324.0, top: 534.0, x1: 333.0, bottom: 543.5 } },
    { kind: 'tick', page: P_FRONT, key: 'b.threshold', equals: '2', rect: { x0: 324.0, top: 557.0, x1: 333.0, bottom: 566.5 } },
    { kind: 'tick', page: P_FRONT, key: 'b.threshold', equals: '3', rect: { x0: 324.0, top: 580.0, x1: 333.0, bottom: 589.5 } },
    text(P_FRONT, 'b.grant', 335, 615.4, 228, { format: 'amount' }),
    { kind: 'wrap', page: P_FRONT, key: 'b.why', x: 37, top: 661, width: 528, height: 118, size: 9, minSize: 6.5 }
  );

  // Page 2: utilisation table.
  const util: [string, number][] = [
    ['machinery', 57.5],
    ['stock', 81.5],
    ['other', 105.5],
  ];
  for (const [row, baseline] of util) {
    ops.push(
      text(P_FUNDING, `b.util.${row}.amount`, 254, baseline, 165, { format: 'money' }),
      text(P_FUNDING, `b.util.${row}.asset`, 431, baseline, 138, { size: 9, minSize: 6.5 })
    );
  }
  ops.push(text(P_FUNDING, 'b.util.total', 254, 127.5, 165, { format: 'money' }));

  // Page 2: jobs, only for the threshold the applicant chose.
  const jobBaselines: Record<ThresholdKey, [number, number]> = { '1': [205.6, 236.6], '2': [260.2, 291.1], '3': [314.7, 345.6] };
  (Object.keys(jobBaselines) as ThresholdKey[]).forEach((k) => {
    const when: Condition = { key: 'b.threshold', equals: k };
    const [perm, temp] = jobBaselines[k];
    ops.push(text(P_FUNDING, 'b.jobs_perm', 414, perm, 50, { when }), text(P_FUNDING, 'b.jobs_temp', 414, temp, 50, { when }));
  });

  // Page 2: past public funding (Yes / No, then up to two rows).
  ops.push(
    { kind: 'tick', page: P_FUNDING, key: 'b.prior', equals: 'yes', rect: { x0: 40.5, top: 477.0, x1: 49.5, bottom: 486.0 } },
    { kind: 'tick', page: P_FUNDING, key: 'b.prior', equals: 'no', rect: { x0: 40.5, top: 493.0, x1: 49.5, bottom: 502.0 } }
  );
  const priorWhen: Condition = { key: 'b.prior', equals: 'yes' };
  const priorBaselines = [626.5, 644.5];
  const priorCols: [string, number, number, ValueFormat][] = [
    ['institution', 82, 99, 'text'],
    ['type', 188, 84, 'text'],
    ['amount', 279, 88, 'money'],
    ['year', 376, 74, 'text'],
    ['purpose', 457, 73, 'text'],
  ];
  priorBaselines.forEach((baseline, i) => {
    for (const [field, x, w, format] of priorCols) {
      ops.push(text(P_FUNDING, `b.prior.${i + 1}.${field}`, x, baseline, w, { size: 8, minSize: 5.5, format, when: priorWhen }));
    }
  });

  // Section C (page 3): circle the sector, write the description.
  for (const s of SECTORS) ops.push({ kind: 'circle', page: P_SECTOR, key: 'c.sector', equals: s.value, rect: s.rect });
  ops.push({ kind: 'wrap', page: P_SECTOR, key: 'c.description', x: 37, top: 259, width: 528, height: 118, size: 9, minSize: 6.5 });

  // Section D (page 3): shareholders and directors, five rows each.
  const shBaselines = [480, 498, 516.5, 535, 553];
  const dirBaselines = [641.5, 660, 678, 696.5, 714.5];
  shBaselines.forEach((b, i) => {
    const n = i + 1;
    ops.push(
      text(P_SECTOR, `d.sh.${n}.name`, 38, b, 212, { size: 9, minSize: 6.5 }),
      text(P_SECTOR, `d.sh.${n}.race`, 258, b, 84, { size: 9, minSize: 6.5 }),
      text(P_SECTOR, `d.sh.${n}.id`, 350, b, 127, { size: 9, minSize: 6.5 }),
      text(P_SECTOR, `d.sh.${n}.pct`, 485, b, 85, { format: 'percent' })
    );
  });
  dirBaselines.forEach((b, i) => {
    const n = i + 1;
    ops.push(
      text(P_SECTOR, `d.dir.${n}.name`, 38, b, 212, { size: 9, minSize: 6.5 }),
      text(P_SECTOR, `d.dir.${n}.race`, 258, b, 84, { size: 9, minSize: 6.5 }),
      text(P_SECTOR, `d.dir.${n}.id`, 350, b, 127, { size: 9, minSize: 6.5 }),
      text(P_SECTOR, `d.dir.${n}.role`, 485, b, 85, { size: 9, minSize: 6 })
    );
  });
  ops.push(text(P_SECTOR, 'd.youth_pct', 322, 731, 100, { format: 'percent' }));

  // Section F (page 4): the signatory's printed name and ID only. Signature and date stay blank.
  ops.push(text(P_DECLARATION, 'f.name', 39, 516, 148, { size: 9, minSize: 6.5 }), text(P_DECLARATION, 'f.id', 196, 516, 147, { size: 9, minSize: 6.5 }));

  // Section G (page 8): an X in the right-hand column for each attachment the applicant says is included.
  for (const [key, , top, bottom] of CHECKLIST) {
    const c = (top + bottom) / 2;
    ops.push({ kind: 'tick', page: P_CHECKLIST, key, equals: 'yes', rect: { x0: 504, top: c - 6, x1: 516, bottom: c + 6 } });
  }
  return ops;
}

// ─── Questions the wizard asks ───────────────────────────────────────────────

const yesNo = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const q = (key: string, label: string, type: Question['type'], extra: Partial<Question> = {}): Question => ({ key, label, type, ...extra });

const SECTIONS: FormSection[] = [
  {
    id: 'a',
    title: 'A. Business and applicant',
    questions: [
      q('a.business_name', 'Name of business / trading name', 'text', { required: true }),
      q('a.applicant_name', 'Your name and surname', 'text', { required: true }),
      q('a.age', 'Your age', 'number', { required: true, inputMode: 'numeric', maxLength: 3 }),
      q('a.cipc', 'Business CIPC registration number', 'text', { required: true, placeholder: 'e.g. 2021/123456/07' }),
      q('a.role', 'Your position / role in the business', 'text', { required: true, placeholder: 'e.g. Owner, Director' }),
      q('a.id', 'Your RSA ID number', 'number', { required: true, inputMode: 'numeric', maxLength: 13 }),
      q('a.email', 'E-mail address', 'text', { required: true, inputMode: 'email' }),
      q('a.tel', 'Telephone (optional)', 'text', { inputMode: 'tel' }),
      q('a.cell', 'Cell number', 'text', { required: true, inputMode: 'tel' }),
      q('a.alt', 'Alternative number (optional)', 'text', { inputMode: 'tel' }),
      q('a.address', 'Residential / business address', 'text', { required: true }),
      q('a.city', 'City / town / village', 'text', { required: true }),
      q('a.district', 'District', 'text', { required: true }),
      q('a.ward', 'Ward (if you know it)', 'text'),
      q('a.province', 'Province', 'text', { required: true, placeholder: 'KwaZulu-Natal' }),
      q('a.postal', 'Postal code', 'number', { inputMode: 'numeric', maxLength: 4 }),
    ],
  },
  {
    id: 'b',
    title: 'B. The funding you are asking for',
    intro: 'Pick the threshold that matches the amount. Whole rand only (no cents).',
    questions: [
      q('b.threshold', 'Funding threshold', 'choice', {
        required: true,
        options: (Object.keys(THRESHOLDS) as ThresholdKey[]).map((k) => ({
          value: k,
          label: `${THRESHOLDS[k].name}: ${THRESHOLDS[k].who}, R${THRESHOLDS[k].min.toLocaleString('en-ZA').replace(/\u00A0/g, ' ')} to R${THRESHOLDS[k].max.toLocaleString('en-ZA').replace(/\u00A0/g, ' ')} (at least ${THRESHOLDS[k].jobs} jobs)`,
        })),
      }),
      q('b.grant', 'Total grant you are asking for (rand)', 'number', { required: true, inputMode: 'numeric', maxLength: 9 }),
      q('b.why', 'Why do you need the funding? Explain how you will use it.', 'textarea', {
        required: true,
        maxLength: 1500,
        help: 'The space on the form is limited. If you need more room, the form allows one extra attached page.',
      }),
      q('b.util.machinery.amount', 'Machinery and equipment: amount (rand)', 'number', { inputMode: 'numeric', maxLength: 9 }),
      q('b.util.machinery.asset', 'Machinery and equipment: what you will buy', 'text'),
      q('b.util.stock.amount', 'Stock / working capital: amount (rand, at most 10%)', 'number', { inputMode: 'numeric', maxLength: 9 }),
      q('b.util.stock.asset', 'Stock / working capital: what for', 'text'),
      q('b.util.other.amount', 'Other: amount (rand)', 'number', { inputMode: 'numeric', maxLength: 9 }),
      q('b.util.other.asset', 'Other: what for', 'text'),
      q('b.jobs_perm', 'Permanent jobs you will create', 'number', { inputMode: 'numeric', maxLength: 4 }),
      q('b.jobs_temp', 'Temporary jobs you will create', 'number', { inputMode: 'numeric', maxLength: 4 }),
      q('b.prior', 'In the past 10 years, have you, your business or any related entity received funding, grants, loans or incentives from government or any public body?', 'choice', {
        required: true,
        options: yesNo,
        help: 'You must disclose it. Not disclosing can lead to disqualification or having to pay the money back.',
      }),
    ],
    rowGroups: [
      {
        id: 'prior',
        title: 'Past public funding',
        help: 'The form has room for two entries. If there are more, list them on one attached page.',
        maxRows: 2,
        showIf: { key: 'b.prior', equals: 'yes' },
        columns: [
          { field: 'institution', label: 'Funding institution', type: 'text' },
          { field: 'type', label: 'Type of funding', type: 'text' },
          { field: 'amount', label: 'Amount received (rand)', type: 'number', maxLength: 9 },
          { field: 'year', label: 'Year awarded', type: 'number', maxLength: 4 },
          { field: 'purpose', label: 'Purpose', type: 'text' },
        ],
        keyFor: (row, field) => `b.prior.${row}.${field}`,
      },
    ],
  },
  {
    id: 'c',
    title: 'C. Your sector',
    questions: [
      q('c.sector', 'Sector the business operates in', 'choice', { required: true, options: SECTORS.map((s) => ({ value: s.value, label: s.label })) }),
      q('c.description', 'Brief description of the business: core activities, start date, etc.', 'textarea', { required: true, maxLength: 1400 }),
    ],
  },
  {
    id: 'd',
    title: 'D. Ownership',
    intro: 'If you are the only owner, you hold 100%. Otherwise at least 80% must be owned by young people (18 to 35).',
    questions: [q('d.youth_pct', 'Percentage of youth ownership in the business', 'number', { required: true, inputMode: 'numeric', maxLength: 3 })],
    rowGroups: [
      {
        id: 'shareholders',
        title: 'Shareholders / beneficiaries',
        maxRows: 5,
        columns: [
          { field: 'name', label: 'Name and surname', type: 'text' },
          { field: 'race', label: 'Race', type: 'text', placeholder: 'as on the form' },
          { field: 'id', label: 'ID number', type: 'number', maxLength: 13 },
          { field: 'pct', label: 'Shareholding %', type: 'number' },
        ],
        keyFor: (row, field) => `d.sh.${row}.${field}`,
      },
      {
        id: 'directors',
        title: 'Executives / directors / trustees / members / partners',
        maxRows: 5,
        columns: [
          { field: 'name', label: 'Name and surname', type: 'text' },
          { field: 'race', label: 'Race', type: 'text', placeholder: 'as on the form' },
          { field: 'id', label: 'ID number', type: 'number', maxLength: 13 },
          { field: 'role', label: 'Role in the business', type: 'text' },
        ],
        keyFor: (row, field) => `d.dir.${row}.${field}`,
      },
    ],
  },
  {
    id: 'f',
    title: 'F. Declaration',
    intro: 'Only the printed name and ID number are filled. You sign and date it yourself.',
    questions: [q('f.name', 'Full name of the person who will sign', 'text', { required: true }), q('f.id', 'ID number of the person who will sign', 'number', { required: true, inputMode: 'numeric', maxLength: 13 })],
  },
  {
    id: 'g',
    title: 'G. Documents you are attaching',
    intro: 'Tick only what you will really hand in. Each tick puts an X in the form’s checklist.',
    questions: CHECKLIST.map(([key, label]) => q(key, label, 'check')),
  },
];

const LABELS: Record<string, string> = {};
for (const s of SECTIONS) {
  for (const question of s.questions) LABELS[question.key] = question.label;
  for (const g of s.rowGroups ?? []) {
    for (let n = 1; n <= g.maxRows; n++) for (const c of g.columns) LABELS[g.keyFor(n, c.field)] = `${g.title}, row ${n}: ${c.label}`;
  }
}
export const labelFor = (key: string): string => LABELS[key] ?? key;

// ─── Prefill from the applicant's own profile ────────────────────────────────

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const digitsOnly = (v: string): string => v.replace(/\D/g, '');

/** A suggestion only: the applicant confirms or changes it in the wizard. */
export function guessSector(industry: string): string {
  const i = industry.toLowerCase();
  const rules: [RegExp, string][] = [
    [/aquacult|fish farm|fishery/, 'aquaculture'],
    [/blue economy|marine|maritime|ocean/, 'blue'],
    [/agri|farm|crop|livestock|poultry|vegetable/, 'agriculture'],
    [/touris|hospitality|hotel|lodge|guest ?house|bnb|restaurant|catering|travel/, 'tourism'],
    [/manufactur|factory|fabricat|production|sewing|clothing|furniture/, 'manufacturing'],
    [/mining|mineral|quarry/, 'mining'],
    [/green|solar|renewable|recycl|waste|environment/, 'green'],
    [/software|digital|ict|technolog|science|innovation|engineering/, 'science'],
    [/retail|shop|spaza|store|trading|wholesale/, 'retail'],
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
  const owner = str(o.name);
  const id = digitsOnly(str(o.idNumber));
  set('a.business_name', str(p.name) || src.businessName);
  set('a.applicant_name', owner);
  set('a.age', digitsOnly(str(o.age)));
  set('a.cipc', str(p.registration));
  set('a.id', id);
  set('a.email', src.email);
  set('a.cell', str(p.whatsapp) || str(src.whatsapp));
  set('c.description', str(p.description).slice(0, 900));
  set('c.sector', guessSector(str(p.industry)));
  // The applicant is usually also the first shareholder and director; share/role stay blank for them to answer.
  set('d.sh.1.name', owner);
  set('d.sh.1.race', str(o.race));
  set('d.sh.1.id', id);
  set('d.dir.1.name', owner);
  set('d.dir.1.race', str(o.race));
  set('d.dir.1.id', id);
  set('f.name', owner);
  set('f.id', id);
  const cats = src.documentCategories ?? [];
  if (cats.includes('CIPC Registration')) set('g.2', 'yes');
  if (cats.includes('Tax Clearance')) set('g.6', 'yes');
  return a;
}

// ─── Checks before a PDF can be produced ─────────────────────────────────────

const REQUIRED_KEYS = SECTIONS.flatMap((s) => s.questions.filter((x) => x.required).map((x) => x.key)).concat(['d.sh.1.name', 'd.sh.1.id', 'd.sh.1.pct']);

function validate(a: AnswerMap): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (key: string, message: string) => errors.push({ key, message });
  const warn = (message: string, key?: string) => warnings.push({ key, message });

  for (const key of REQUIRED_KEYS) {
    if (isBlank(a[key])) err(key, `Add: ${labelFor(key)}`);
  }

  // Threshold, amount and jobs must agree with each other.
  const grant = toInt(a['b.grant']);
  if (isThreshold(a['b.threshold']) && grant > 0) {
    const t = THRESHOLDS[a['b.threshold']];
    if (grant < t.min || grant > t.max) {
      err('b.grant', `R${grant} is outside ${t.name} (R${t.min} to R${t.max}). Change the threshold or the amount.`);
    }
    const jobs = toInt(a['b.jobs_perm']) + toInt(a['b.jobs_temp']);
    if (jobs === 0) err('b.jobs_perm', `Say how many jobs you will create. ${t.name} needs at least ${t.jobs}.`);
    else if (jobs < t.jobs) warn(`${t.name} says at least ${t.jobs} jobs must be created. You entered ${jobs}.`, 'b.jobs_perm');
  }

  // Use of funds.
  const machinery = toInt(a['b.util.machinery.amount']);
  const stock = toInt(a['b.util.stock.amount']);
  const other = toInt(a['b.util.other.amount']);
  const total = machinery + stock + other;
  if (total === 0) err('b.util.machinery.amount', 'Fill in at least one line of how the money will be used (machinery, stock or other).');
  else if (grant > 0 && total !== grant) warn(`The three lines add up to R${total}, but you are asking for R${grant}. They should match.`, 'b.util.machinery.amount');
  if (grant > 0 && stock * 10 > grant) warn('Stock / working capital may not be more than 10% of the funding.', 'b.util.stock.amount');

  // Past funding.
  if (a['b.prior'] === 'yes') {
    if (isBlank(a['b.prior.1.institution'])) err('b.prior.1.institution', 'Say who funded you before (first row of the past funding table).');
    warn('The fund’s rules say businesses funded by government or a public entity in the past 10 years are not eligible. You must still disclose it. This will probably disqualify the application.', 'b.prior');
  }

  // Eligibility hints from the form's own rules. These do not block the PDF.
  const age = toInt(a['a.age']);
  if (age > 0 && (age < 18 || age > 35)) warn('The fund is for people aged 18 to 35.', 'a.age');
  const id = digitsOnly(a['a.id'] ?? '');
  if (id && id.length !== 13) warn('A South African ID number has 13 digits.', 'a.id');
  const province = (a['a.province'] ?? '').toLowerCase();
  if (province && !/kwazulu|kzn/.test(province)) warn('The fund is only for KwaZulu-Natal residents and businesses.', 'a.province');
  const youth = toInt(a['d.youth_pct']);
  if (!isBlank(a['d.youth_pct']) && youth < 80) warn('At least 80% of the business must be youth owned (100% if you are the only owner).', 'd.youth_pct');
  if (a['b.threshold'] === '3') {
    warn('The form says Threshold 3 applicants must not have turned over more than R500,000 a year. That is unusual for a scale-up tier, so check with the Office of the Premier before you apply.', 'b.threshold');
  }
  if (a['c.sector'] === 'science') {
    warn('The form’s excluded list rules out app development and research, even though Science, Technology and Innovation is a listed sector. If your business is app development, check first.', 'c.sector');
  }
  return { errors, warnings };
}

function computed(a: AnswerMap): AnswerMap {
  const total = toInt(a['b.util.machinery.amount']) + toInt(a['b.util.stock.amount']) + toInt(a['b.util.other.amount']);
  return total > 0 ? { 'b.util.total': String(total) } : {};
}

// ─── The template ────────────────────────────────────────────────────────────

export const KZN_YOUTH_FUND_2026: FormTemplate = {
  id: 'kzn-youth-empowerment-fund-2026-27',
  title: 'KwaZulu-Natal Youth Empowerment Fund: Funding Application Form 2026/27',
  assetPath: '/assets/forms/kzn-youth-fund-2026-27.pdf',
  matches: (o) => {
    if (!/youth\s+empowerment\s+fund/i.test(o.programme_name)) return false;
    if (!/kwazulu|kzn/i.test(`${o.programme_name} ${o.issuer_name} ${o.geo_scope}`)) return false;
    const closing = o.closing_date ?? '';
    return !/^\d{4}-\d{2}-\d{2}$/.test(closing) || (closing >= '2026-04-01' && closing <= '2027-03-31');
  },
  intro: [
    'This fills the official 2026/27 form from your answers, here in your browser. Nothing you type is sent to us or to an AI.',
    'You still print it, sign it, and hand it in with certified copies at your nearest local or district municipal office. Emailed forms are not accepted.',
  ],
  rules: [
    'South African citizen aged 18 to 35, living in KwaZulu-Natal and running the business there.',
    '80% youth owned if there is more than one owner (100% if you are the only owner). Cooperatives need their certificate and 80% youth ownership.',
    'The business must not have been funded by government or any public entity in the past 10 years.',
    'Not funded: standalone alcohol or tobacco businesses, gambling, minibus, coach or app-based taxis, app development and research, guns for security or trading, money trading and investment businesses, pyramid schemes.',
    'Stock / working capital may not be more than 10% of the funding. The money cannot repay loans, pay SARS or municipal debt, or buy a private home.',
  ],
  neverFilled: [
    'The signature and date columns in the declaration table (page 4)',
    'The YES / NO box and the “Signature of applicant” and “Date” lines (page 4)',
    'Anything you leave blank here stays blank on the form',
  ],
  sections: SECTIONS,
  ops: buildOps(),
  prefill,
  validate,
  computed,
};

export { SECTIONS as KZN_SECTIONS, CHECKLIST as KZN_CHECKLIST, SECTORS as KZN_SECTORS, conditionHolds };
export type { RowGroup };
