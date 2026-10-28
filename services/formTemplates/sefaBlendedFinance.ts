// services/formTemplates/sefaBlendedFinance.ts
/**
 * ECRDA / sefa Rural Blended Finance Scheme - Loan Application Form (4 pages).
 *
 * Every position below was measured from the official PDF
 * (public/assets/forms/sefa-ecrda-blended-finance.pdf), in PDF points from
 * the TOP-LEFT of an A4 page. The form is a bordered table: labels sit in
 * shaded cells on the left and answers go in the open area to the right of
 * each cell, on the cell's bottom line.
 *
 * The scheme is delivered by the Eastern Cape Rural Development Agency (ECRDA)
 * together with sefa (the Small Enterprise Finance Agency, now part of SEDFA).
 * Annexure 2 of the form itself is the source for the rules in `rules` and
 * `validate`.
 *
 * Deliberately NOT filled: the signature block (surname/full name/designation
 * of the signatory ARE filled as printed text; place, date and the signature
 * itself never are), and the disability "give details" line (no space on the
 * form).
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
  ValidationResult,
  ValueFormat,
} from '../formModel';

// ─── Page indexes (0-based) ──────────────────────────────────────────────────
const P_COMPANY = 0; // Section A + contact person + funding requirements
const P_OWNER = 1; // Section B + declaration + signatures
const P_CHECKLIST = 2; // Annexure 1: application checklist

// ─── Scheme numbers printed in Annexure 2 ────────────────────────────────────
export const SCHEME = {
  maxFinance: 2_500_000,
  maxTermMonths: 60,
  rateFromPct: 5,
} as const;

// ─── Option lists ────────────────────────────────────────────────────────────

const TITLES = [
  { value: 'prof', label: 'Prof' },
  { value: 'dr', label: 'Dr' },
  { value: 'mr', label: 'Mr' },
  { value: 'mrs', label: 'Mrs' },
];

const CORRESPONDENCE = [
  { value: 'collect', label: 'Collecting in person at ECRDA offices' },
  { value: 'post', label: 'Post' },
  { value: 'email', label: 'E-mail' },
];

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const yesNo = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/** Funding requirement rows on page 1: [key, label, baseline of the row line]. */
const FUNDING_ROWS: [string, string, number][] = [
  ['f.equipment', 'Equipment, machinery, tools, etc. (rand)', 673.2],
  ['f.livestock', 'Livestock (rand)', 688.5],
  ['f.poultry', 'Poultry & Piggery (rand)', 703.7],
  ['f.vegetables', 'Vegetables (rand)', 719.0],
  ['f.citrus', 'Citrus (rand)', 734.3],
  ['f.grain', 'Grain (rand)', 749.6],
  ['f.wool', 'Wool (rand)', 765.0],
  ['f.nuts', 'Nuts (rand)', 780.2],
  ['f.working', 'Working capital (rand)', 795.5],
  ['f.other', 'Other (rand)', 810.8],
];

/** Annexure 1 checklist: [key, label, vertical centre of the item's first line]. */
const CHECKLIST: [string, string, number][] = [
  ['c.1', 'Certified copy of ID and that of spouse (if married In Community of Property), not older than 3 months', 196.1],
  ['c.2', 'Marriage certificate / marriage contract (where applicable)', 243.3],
  ['c.3', 'Short CV of the members/directors/shareholders/owners', 274.6],
  ['c.4', 'Proof of residence (utility bill or sworn affidavit, not older than 3 months)', 305.9],
  ['c.5', 'Valid Tax Clearance Certificate', 337.2],
  ['c.6', 'Company Registration Documents (e.g. CK 2 / CK 14.3)', 352.5],
  ['c.7', 'Proof of CIPC/CIPRO annual fees', 383.7],
  ['c.8', 'Six months latest bank statement (personal and business)', 399.0],
  ['c.9', 'Supporting quotations (with contact person and banking details of supplier)', 430.2],
  ['c.10', 'Personal Income and Expenditure and Assets & Liability Statement of the Director(s)', 461.6],
  ['c.11', 'Members / Shareholders resolution to apply (if applicable)', 492.9],
  ['c.12', 'If under default judgement: arrangement letter with creditor(s) and 3 months of payments', 524.1],
  ['c.13', 'Lease agreement / letter of intent to lease (if applicable)', 603.4],
  ['c.14', 'Lease agreement (second copy line printed by the form)', 634.7],
  ['c.15', 'Franchise Agreement (if applicable)', 666.0],
  ['c.16', 'Cashflow projections with clear assumptions for a 36-month period', 681.3],
  ['c.17', 'Funding proposal and cashflow projections', 712.5],
  ['c.18', 'Business profile / Business Plan', 727.8],
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
const tick = (page: number, key: string, equals: string, x0: number, top: number, size = 10): DrawOp => ({
  kind: 'tick',
  page,
  key,
  equals,
  rect: { x0, top, x1: x0 + size, bottom: top + size },
});

function buildOps(): DrawOp[] {
  const ops: DrawOp[] = [];

  // Section A (page 1). Answer areas sit right of the shaded label cells
  // (left cell ends at x=199.4; right-hand label cells end at x=461.5/417.8).
  ops.push(
    text(P_COMPANY, 'a.cipc_name', 205, 234.4, 347),
    text(P_COMPANY, 'a.trading_name', 205, 249.7, 347),
    text(P_COMPANY, 'a.business_type', 205, 265.0, 160),
    text(P_COMPANY, 'a.industry', 467, 265.0, 85),
    text(P_COMPANY, 'a.reg_number', 205, 280.3, 160),
    text(P_COMPANY, 'a.reg_date', 467, 280.3, 85, { size: 8.5, minSize: 6 }),
    text(P_COMPANY, 'a.email', 205, 295.6, 347),
    text(P_COMPANY, 'a.tax_ref', 205, 310.8, 347),
    text(P_COMPANY, 'a.physical_address', 205, 326.5, 347, { size: 9, minSize: 6.5 }),
    text(P_COMPANY, 'a.phys_province', 253, 341.4, 118),
    text(P_COMPANY, 'a.phys_code', 467, 341.4, 85),
    text(P_COMPANY, 'a.postal_address', 205, 356.7, 347, { size: 9, minSize: 6.5 }),
    text(P_COMPANY, 'a.post_province', 253, 372.0, 118),
    text(P_COMPANY, 'a.post_code', 423, 372.0, 125),
    text(P_COMPANY, 'a.district', 205, 387.2, 42, { size: 8, minSize: 5.5 }),
    text(P_COMPANY, 'a.local_muni', 378, 387.2, 170),
    text(P_COMPANY, 'a.township', 205, 402.5, 42, { size: 8, minSize: 5.5 }),
    text(P_COMPANY, 'a.gps', 378, 402.5, 170, { size: 8.5, minSize: 6 }),
    text(P_COMPANY, 'a.years_trading', 205, 424.0, 42),
    text(P_COMPANY, 'a.employees', 378, 424.0, 170),
    text(P_COMPANY, 'a.new_jobs', 205, 445.0, 347),
    tick(P_COMPANY, 'a.correspondence', 'collect', 203, 473.5),
    tick(P_COMPANY, 'a.correspondence', 'post', 285, 473.5),
    tick(P_COMPANY, 'a.correspondence', 'email', 425, 473.5)
  );

  // Contact person (page 1).
  ops.push(
    tick(P_COMPANY, 'c.title', 'prof', 285, 541.5),
    tick(P_COMPANY, 'c.title', 'dr', 347, 541.5),
    tick(P_COMPANY, 'c.title', 'mr', 422, 541.5),
    tick(P_COMPANY, 'c.title', 'mrs', 511, 541.5),
    text(P_COMPANY, 'c.surname', 205, 565.5, 347),
    text(P_COMPANY, 'c.first_names', 205, 580.8, 347),
    text(P_COMPANY, 'c.cell', 253, 596.0, 118),
    text(P_COMPANY, 'c.tel', 423, 596.0, 125),
    text(P_COMPANY, 'c.email', 205, 611.3, 347)
  );

  // Funding requirements (page 1): amounts go right of the printed "R".
  for (const [key, , baseline] of FUNDING_ROWS) {
    ops.push(text(P_COMPANY, key, 214, baseline, 334, { format: 'amount' }));
  }
  ops.push(text(P_COMPANY, 'f.total', 214, 826.0, 334, { format: 'amount' }));

  // Section B (page 2): owner / shareholder details.
  ops.push(
    text(P_OWNER, 'b.surname', 195, 147.0, 354),
    text(P_OWNER, 'b.first_names', 195, 162.2, 354),
    text(P_OWNER, 'b.id_number', 195, 177.5, 354),
    tick(P_OWNER, 'b.gender', 'male', 227, 183.5),
    tick(P_OWNER, 'b.gender', 'female', 307, 183.5),
    text(P_OWNER, 'b.nationality', 402, 192.5, 146),
    text(P_OWNER, 'b.race', 195, 208.4, 57, { size: 8, minSize: 5.5 }),
    tick(P_OWNER, 'b.disability', 'yes', 365, 201.5, 8),
    tick(P_OWNER, 'b.disability', 'no', 399, 201.5, 8),
    text(P_OWNER, 'b.role', 195, 222.9, 354),
    text(P_OWNER, 'b.email', 195, 238.4, 141),
    text(P_OWNER, 'b.cell', 430, 238.4, 118),
    text(P_OWNER, 'b.tel', 195, 253.6, 141),
    text(P_OWNER, 'b.marital_status', 430, 253.6, 118),
    { kind: 'wrap', page: P_OWNER, key: 'b.physical_address', x: 195, top: 260, width: 345, height: 24, size: 9, minSize: 6.5 },
    text(P_OWNER, 'b.phys_code', 464, 299.0, 84),
    { kind: 'wrap', page: P_OWNER, key: 'b.postal_address', x: 195, top: 306, width: 225, height: 24, size: 9, minSize: 6.5 },
    text(P_OWNER, 'b.post_code', 464, 329.5, 84)
  );

  // Signature block (page 2): printed details only. Place, date and the
  // signature itself are never drawn - see neverFilled.
  ops.push(
    text(P_OWNER, 'sig.surname', 200, 746.0, 345),
    text(P_OWNER, 'sig.full_names', 200, 761.3, 345),
    text(P_OWNER, 'sig.designation', 200, 776.5, 345)
  );

  // Annexure 1 (page 3): an X in the Note column for each attached document.
  for (const [key, , centre] of CHECKLIST) {
    ops.push(tick(P_CHECKLIST, key, 'yes', 310, centre - 5, 10));
  }
  return ops;
}

// ─── Questions the wizard asks ───────────────────────────────────────────────

const q = (key: string, label: string, type: Question['type'], extra: Partial<Question> = {}): Question => ({ key, label, type, ...extra });

const SECTIONS: FormSection[] = [
  {
    id: 'a',
    title: 'A. Company information',
    questions: [
      q('a.cipc_name', 'CIPC registered name', 'text', { required: true, placeholder: 'as registered' }),
      q('a.trading_name', 'Trading name (if different)', 'text'),
      q('a.business_type', 'Type of business', 'text', { required: true, placeholder: 'e.g. farming, catering, manufacturing' }),
      q('a.industry', 'Industry (sector)', 'text', { required: true, placeholder: 'e.g. Agriculture' }),
      q('a.reg_number', 'Registration number', 'text', { required: true, placeholder: 'e.g. 2021/123456/07' }),
      q('a.reg_date', 'Registration date', 'text', { placeholder: 'e.g. 12 March 2021' }),
      q('a.email', 'Company e-mail address', 'text', { required: true, inputMode: 'email' }),
      q('a.tax_ref', 'Tax reference number', 'text'),
      q('a.physical_address', 'Physical address', 'text', { required: true }),
      q('a.phys_province', 'Province (physical address)', 'text', { required: true, placeholder: 'Eastern Cape' }),
      q('a.phys_code', 'Postal code (physical address)', 'number', { required: true, inputMode: 'numeric', maxLength: 4 }),
      q('a.postal_address', 'Postal address (if different)', 'text'),
      q('a.post_province', 'Province (postal address)', 'text'),
      q('a.post_code', 'Postal code (postal address)', 'number', { inputMode: 'numeric', maxLength: 4 }),
      q('a.district', 'District municipality', 'text', { required: true, placeholder: 'e.g. Amathole' }),
      q('a.local_muni', 'Local municipality', 'text', { required: true }),
      q('a.township', 'Township / village', 'text', { required: true }),
      q('a.gps', 'GPS coordinates (optional)', 'text'),
      q('a.years_trading', 'Period in business (years)', 'number', { required: true, inputMode: 'numeric', maxLength: 3 }),
      q('a.employees', 'Number of current employees', 'number', { required: true, inputMode: 'numeric', maxLength: 6 }),
      q('a.new_jobs', 'New jobs expected to be created', 'number', { required: true, inputMode: 'numeric', maxLength: 6 }),
      q('a.correspondence', 'How should ECRDA send you correspondence?', 'choice', { required: true, options: CORRESPONDENCE }),
    ],
  },
  {
    id: 'c',
    title: 'Contact person / company representative',
    questions: [
      q('c.title', 'Title', 'choice', { required: true, options: TITLES, help: 'The form only offers Prof, Dr, Mr and Mrs.' }),
      q('c.surname', 'Surname', 'text', { required: true }),
      q('c.first_names', 'First name(s)', 'text', { required: true }),
      q('c.cell', 'Cell number', 'text', { required: true, inputMode: 'tel' }),
      q('c.tel', 'Telephone number (optional)', 'text', { inputMode: 'tel' }),
      q('c.email', 'E-mail address', 'text', { required: true, inputMode: 'email' }),
    ],
  },
  {
    id: 'f',
    title: 'Funding requirements',
    intro: 'Whole rand only (no cents). Fill the lines that apply to your application; the total is worked out for you.',
    questions: FUNDING_ROWS.map(([key, label]) => q(key, label, 'number', { inputMode: 'numeric', maxLength: 9 })),
  },
  {
    id: 'b',
    title: 'B. Shareholder / member / owner information',
    intro: 'The form has one owner block. Fill it for the main member or shareholder.',
    questions: [
      q('b.surname', 'Owner surname', 'text', { required: true }),
      q('b.first_names', 'Owner first name(s)', 'text', { required: true }),
      q('b.id_number', 'Owner RSA ID number', 'number', { required: true, inputMode: 'numeric', maxLength: 13 }),
      q('b.gender', 'Owner gender', 'choice', { required: true, options: GENDERS }),
      q('b.nationality', 'Owner nationality', 'text', { required: true, placeholder: 'South African' }),
      q('b.race', 'Owner race', 'text', { required: true }),
      q('b.disability', 'Any disability?', 'choice', { required: true, options: yesNo }),
      q('b.role', 'Operational role in the business', 'text', { required: true }),
      q('b.email', 'Owner e-mail address', 'text', { inputMode: 'email' }),
      q('b.cell', 'Owner cell number', 'text', { inputMode: 'tel' }),
      q('b.tel', 'Owner telephone number (optional)', 'text', { inputMode: 'tel' }),
      q('b.marital_status', 'Owner marital status', 'text', { placeholder: 'e.g. Single, Married' }),
      q('b.physical_address', 'Owner physical address', 'text', { required: true }),
      q('b.phys_code', 'Owner postal code', 'number', { required: true, inputMode: 'numeric', maxLength: 4 }),
      q('b.postal_address', 'Owner postal address (if different)', 'text'),
      q('b.post_code', 'Owner postal address postal code', 'number', { inputMode: 'numeric', maxLength: 4 }),
    ],
  },
  {
    id: 'sig',
    title: 'Signatory (printed details only)',
    intro: 'Only the printed name and designation are filled. The signature, place and date stay blank for you to complete by hand.',
    questions: [
      q('sig.surname', 'Signatory surname', 'text', { required: true }),
      q('sig.full_names', 'Signatory full name(s)', 'text', { required: true }),
      q('sig.designation', 'Signatory designation', 'text', { required: true, placeholder: 'e.g. Member, Director' }),
    ],
  },
  {
    id: 'docs',
    title: 'Annexure 1: documents you are attaching',
    intro: 'Tick only what you will really hand in. Each tick puts an X in the Note column beside that item.',
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

function prefill(src: ProfileSource): AnswerMap {
  const p = src.profile ?? {};
  const o = src.ownerInfo ?? {};
  const a: AnswerMap = {};
  const set = (key: string, value: string) => {
    if (value) a[key] = value;
  };
  const fullName = str(o.name);
  const parts = fullName.split(/\s+/).filter(Boolean);
  const surname = parts.length > 1 ? parts[parts.length - 1] : '';
  const firstNames = parts.slice(0, -1).join(' ');
  const id = digitsOnly(str(o.idNumber));
  set('a.cipc_name', str(p.name) || src.businessName);
  set('a.trading_name', str(p.tradingName));
  set('a.business_type', str(p.description).slice(0, 60));
  set('a.industry', str(p.industry));
  set('a.reg_number', str(p.registration));
  set('a.email', src.email);
  set('a.physical_address', str(p.address) || str(o.address));
  set('a.phys_province', str(p.province));
  set('a.phys_code', digitsOnly(str(p.postalCode)).slice(0, 4));
  set('c.surname', surname);
  set('c.first_names', firstNames);
  set('c.cell', str(p.whatsapp) || str(src.whatsapp));
  set('c.email', src.email);
  set('b.surname', surname);
  set('b.first_names', firstNames);
  set('b.id_number', id);
  set('b.nationality', 'South African');
  set('b.race', str(o.race));
  set('b.role', str(o.position) || 'Owner');
  set('b.cell', str(p.whatsapp) || str(src.whatsapp));
  set('b.email', src.email);
  set('b.physical_address', str(o.address) || str(p.address));
  set('sig.surname', surname);
  set('sig.full_names', fullName);
  set('sig.designation', str(o.position) || 'Owner');
  const cats = src.documentCategories ?? [];
  if (cats.includes('Certified ID Copy')) set('c.1', 'yes');
  if (cats.includes('Proof of Residence') || cats.includes('Proof of Address')) set('c.4', 'yes');
  if (cats.includes('Tax Clearance')) set('c.5', 'yes');
  if (cats.includes('CIPC Registration')) set('c.6', 'yes');
  if (cats.includes('Bank Statement')) set('c.8', 'yes');
  if (cats.includes('Quotations')) set('c.9', 'yes');
  if (cats.includes('Business Plan')) set('c.18', 'yes');
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
    // A question hidden behind a condition is only required when that
    // condition holds (future-proofing: this template has none yet).
    if (!conditionHolds(showIf, a)) continue;
    if (isBlank(a[key])) err(key, `Add: ${labelFor(key)}`);
  }

  // Funding lines.
  const total = FUNDING_ROWS.reduce((sum, [key]) => sum + toInt(a[key]), 0);
  if (total === 0) err('f.equipment', 'Fill in at least one line of the funding requirements.');
  if (total > SCHEME.maxFinance) {
    warn(`The scheme's financial package is capped at R2 500 000. Your lines add up to R${total.toLocaleString('en-ZA').replace(/\u00A0/g, ' ')}.`, 'f.total');
  }

  // Rules printed in Annexure 2 of the form itself.
  if (!/^south african$/i.test(a['b.nationality'] ?? 'South African')) {
    warn('The business must be 100% owned by South African nationals.', 'b.nationality');
  }
  if (isBlank(a['a.reg_number'])) {
    warn('The entity must be registered with CIPC to participate in the scheme.', 'a.reg_number');
  }
  const province = (a['a.phys_province'] ?? '').toLowerCase();
  if (province && !/eastern cape|^ec\b/.test(province)) {
    warn('The scheme is delivered by the Eastern Cape Rural Development Agency. If your business is outside the Eastern Cape, confirm with ECRDA that you may apply.', 'a.phys_province');
  }

  // Sanity hints.
  const id = digitsOnly(a['b.id_number'] ?? '');
  if (id && id.length !== 13) warn('A South African ID number has 13 digits.', 'b.id_number');
  const newJobs = toInt(a['a.new_jobs']);
  if (newJobs === 0) warn('Say how many new jobs the funding will create - it is part of the developmental assessment.', 'a.new_jobs');
  if (total > 0 && a['c.9'] !== 'yes') warn('Attach supporting quotations - payments are made directly to suppliers.', 'c.9');
  if (total > 0 && a['c.16'] !== 'yes') warn('Attach cashflow projections with clear assumptions for a 36-month period.', 'c.16');

  return { errors, warnings };
}

function computed(a: AnswerMap): AnswerMap {
  const total = FUNDING_ROWS.reduce((sum, [key]) => sum + toInt(a[key]), 0);
  return total > 0 ? { 'f.total': String(total) } : {};
}

// ─── The template ────────────────────────────────────────────────────────────

export const SEFA_BLENDED_FINANCE: FormTemplate = {
  id: 'sefa-ecrda-rural-blended-finance',
  title: 'ECRDA / sefa Rural Blended Finance Scheme: Loan Application Form',
  assetPath: '/assets/forms/sefa-ecrda-blended-finance.pdf',
  matches: (o) => {
    const text = `${o.programme_name} ${o.issuer_name}`;
    if (!/blended finance|rural blended/i.test(o.programme_name)) return false;
    return /ecrda|sefa|sedfa|small enterprise/i.test(text);
  },
  intro: [
    'This fills the official ECRDA / sefa Rural Blended Finance application form from your answers, here in your browser. Nothing you type is sent to us or to an AI.',
    'The scheme is run with the Eastern Cape Rural Development Agency (ECRDA): apply through ECRDA (blended.finance@ecrda.co.za) or any ECRDA regional office. sefa is now part of SEDFA, but this is still the working paper form for the scheme.',
  ],
  rules: [
    'Financial package up to R2 500 000 (working capital, equipment, input costs), part grant depending on developmental impact.',
    'Loan repayment up to 60 months, interest from 5% on the loan component.',
    'Entity must be registered with CIPC and 100% owned by South African nationals.',
    'Employees must be at least 70% South African; non-South Africans need valid work permits.',
    'The enterprise must operate in a township or rural environment.',
    'Must be registered (or applying) with SARS and UIF, and have a business bank account.',
    'Participants must take part in the DSBD / SEDA business development support linked to the scheme.',
  ],
  neverFilled: [
    'The signature, place and date lines in the signature block - those are yours alone',
    'The "If Yes, please give details" disability line (the form gives it no space; write it in by hand if it applies)',
    'Anything you leave blank here stays blank on the form',
  ],
  sections: SECTIONS,
  ops: buildOps(),
  prefill,
  validate,
  computed,
};

export { SECTIONS as SEFA_SECTIONS, CHECKLIST as SEFA_CHECKLIST, FUNDING_ROWS as SEFA_FUNDING_ROWS };
