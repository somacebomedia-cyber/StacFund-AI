// services/portalFormTemplates/sedfaTrep.ts
/**
 * SEDFA Township and Rural Entrepreneurship Programme (TREP) — portal template.
 *
 * TREP supports small enterprises operating in townships and rural areas. The
 * programme has eight sub-sector streams:
 *   1. Small-Scale Bakeries & Confectioneries
 *   2. Autobody Repairers, Mechanics & Small Auto Spares
 *   3. Butcheries
 *   4. Clothing, Leather & Textiles
 *   5. Fruits & Vegetables
 *   6. Personal Care
 *   7. Spaza Shops
 *   8. Tshisanyama & Cooked Food
 *
 * Eligibility: SA nationals, township or rural-based enterprise, owner based in
 * the same area. The SEDFA SMME Portal accepts TREP applications online.
 *
 * Sources:
 *   - Ventureburn (3 Jun 2021) "Township and Rural Entrepreneurship Programme launches".
 *   - Department of Small Business Development / SEDFA Facebook posts on TREP.
 */

import { toInt } from '../formModel';
import type {
  AnswerMap,
  Issue,
  PortalFormTemplate,
  PortalFormSection,
  ProfileSource,
  ValidationResult,
} from '../formModel';
import {
  GENDERS,
  LEGAL_ENTITIES,
  POPULATION_GROUPS,
  SA_PROVINCES,
  YES_NO,
  checkRequired,
  defaultPortalJson,
  entityCode,
  err,
  labelMapFor,
  prefillBusinessAndOwner,
  q,
  sectorCode,
  sumLines,
  warn,
  warnAgeRange,
  warnAmountBand,
  warnId,
  type ValidationCtx,
} from './portalShared';

/** The eight TREP sub-sector streams. The portal expects one of these codes. */
const TREP_STREAMS: { value: string; label: string; portalCode: string }[] = [
  { value: 'bakeries', label: 'Small-Scale Bakeries & Confectioneries', portalCode: 'BAKERIES' },
  { value: 'autobody', label: 'Autobody Repairers, Mechanics & Small Auto Spares', portalCode: 'AUTOBODY' },
  { value: 'butcheries', label: 'Butcheries', portalCode: 'BUTCHERIES' },
  { value: 'clothing', label: 'Clothing, Leather & Textiles', portalCode: 'CLOTHING' },
  { value: 'fruits_veg', label: 'Fruits & Vegetables', portalCode: 'FRUITS_VEG' },
  { value: 'personal_care', label: 'Personal Care', portalCode: 'PERSONAL_CARE' },
  { value: 'spaza', label: 'Spaza Shops', portalCode: 'SPAZA' },
  { value: 'tshisanyama', label: 'Tshisanyama & Cooked Food', portalCode: 'TSHISANYAMA' },
];

const LOCATION_TYPES = [
  { value: 'township', label: 'Township' },
  { value: 'rural', label: 'Rural' },
];

export const SEDFA_TREP: PortalFormTemplate = {
  id: 'sedfa-trep-portal',
  title: 'SEDFA Township and Rural Entrepreneurship Programme (TREP, portal)',
  portalUrl: 'https://systemsnew.sefa.org.za/SMMEPortal',
  programmeCode: 'trep',
  matches: (o) => /trep|township.*rural|rural.*entrepreneur/i.test(o.programme_name) && /sedfa|sefa|small enterprise|dsbd/i.test(o.issuer_name),
  intro: [
    'TREP supports small enterprises operating in townships and rural areas across eight sub-sector streams. This template captures the questions the SEDFA eThuse / SMME Portal asks for TREP, including the stream you are applying under.',
    'Nothing you type is sent to a server or to an AI. You answer here, the wizard writes a JSON object, and you paste it into the portal. The portal stays the system of record.',
  ],
  rules: [
    'South African nationals only.',
    'The enterprise must be based in a township or rural area.',
    'The owner must live in the same township / rural area as the enterprise.',
    'Funding is per-stream: choose one of the eight TREP streams (you can apply under more than one stream in separate applications).',
    'Funding covers working capital, equipment and infrastructure tied to the chosen stream.',
  ],
  portalInstructions: [
    'Open the SEDFA eThuse / SMME Portal at systemsnew.sefa.org.za/SMMEPortal and sign in (or register first if you have not).',
    'Choose TREP — Township and Rural Entrepreneurship Programme from the list of programmes.',
    'Pick the stream you are applying under (Bakeries, Autobody, Butcheries, Clothing/Textile, Fruits/Veg, Personal Care, Spaza, or Tshisanyama/Cooked Food).',
    'Copy the JSON below and paste each field into the matching portal input. Where the portal asks for a single choice, paste the code (e.g. "BAKERIES" for Small-Scale Bakeries).',
    'The portal will ask you to upload documents — use the checklist on the last screen of this wizard to keep track of what you need.',
  ],
  neverFilled: [
    'The portal’s account-registration step — that is the portal’s own signup, not the application',
    'The final declaration and "submit" button — those are yours to click in the portal',
    'Anything you leave blank here stays blank in the JSON, so the portal will still ask you for it',
  ],
  sections: [
    {
      id: 'eligibility',
      title: '1. TREP eligibility',
      questions: [
        q('elig.stream', 'Which TREP stream are you applying under?', 'choice', {
          required: true,
          options: TREP_STREAMS.map((s) => ({ value: s.value, label: s.label })),
          help: 'Each stream has its own scope. Pick the one that matches your business; you can apply under more than one stream in separate applications.',
          portal: { portalKey: 'trep.stream', portalTransform: (v) => TREP_STREAMS.find((s) => s.value === v)?.portalCode ?? 'OTHER' },
        }),
        q('elig.location_type', 'Where is the enterprise based?', 'choice', {
          required: true,
          options: LOCATION_TYPES,
          portal: { portalKey: 'trep.location_type' },
        }),
        q('elig.owner_lives_there', 'Do you (the owner) live in the same township / rural area as the enterprise?', 'choice', {
          required: true,
          options: YES_NO,
          help: 'TREP requires the owner to be based in the same area as the enterprise.',
          portal: { portalKey: 'trep.owner_lives_in_area' },
        }),
        q('elig.sa_national', 'Are you a South African national?', 'choice', {
          required: true,
          options: YES_NO,
          portal: { portalKey: 'trep.owner_sa_national' },
        }),
      ],
    },
    {
      id: 'owner',
      title: '2. The owner',
      questions: [
        q('owner.title', 'Title', 'choice', {
          required: true,
          options: [
            { value: 'mr', label: 'Mr' },
            { value: 'mrs', label: 'Mrs' },
            { value: 'ms', label: 'Ms' },
            { value: 'dr', label: 'Dr' },
          ],
          portal: { portalKey: 'owner.title' },
        }),
        q('owner.first_names', 'First name(s)', 'text', { required: true, portal: { portalKey: 'owner.first_names' } }),
        q('owner.surname', 'Surname', 'text', { required: true, portal: { portalKey: 'owner.surname' } }),
        q('owner.id', 'RSA ID number', 'number', { required: true, inputMode: 'numeric', maxLength: 13, portal: { portalKey: 'owner.id_number' } }),
        q('owner.gender', 'Gender', 'choice', { required: true, options: GENDERS, portal: { portalKey: 'owner.gender' } }),
        q('owner.age', 'Age', 'number', { required: true, inputMode: 'numeric', maxLength: 3, portal: { portalKey: 'owner.age', portalTransform: (v) => toInt(v) } }),
        q('owner.population', 'Population group', 'choice', { required: true, options: POPULATION_GROUPS, portal: { portalKey: 'owner.population_group' } }),
        q('owner.cell', 'Cell number', 'text', { required: true, inputMode: 'tel', portal: { portalKey: 'owner.contact.cell' } }),
        q('owner.email', 'E-mail address', 'text', { required: true, inputMode: 'email', portal: { portalKey: 'owner.contact.email' } }),
        q('owner.address', 'Residential address (in the same township / rural area as the enterprise)', 'text', { required: true, portal: { portalKey: 'owner.contact.physical_address' } }),
        q('owner.province', 'Province', 'choice', {
          required: true,
          options: SA_PROVINCES.map((p) => ({ value: p, label: p })),
          portal: { portalKey: 'owner.contact.province' },
        }),
        q('owner.postal_code', 'Postal code', 'number', { required: true, inputMode: 'numeric', maxLength: 4, portal: { portalKey: 'owner.contact.postal_code' } }),
      ],
    },
    {
      id: 'biz',
      title: '3. The business',
      questions: [
        q('biz.name', 'Registered business name', 'text', { required: true, portal: { portalKey: 'business.registered_name' } }),
        q('biz.trading_name', 'Trading name (if different)', 'text', { portal: { portalKey: 'business.trading_name' } }),
        q('biz.reg_number', 'CIPC registration number (if registered)', 'text', { placeholder: 'e.g. 2021/123456/07', portal: { portalKey: 'business.cipc_number' } }),
        q('biz.entity', 'Legal entity', 'choice', {
          required: true,
          options: LEGAL_ENTITIES,
          portal: { portalKey: 'business.legal_entity', portalTransform: (v) => entityCode(v) },
        }),
        q('biz.entity_other', 'Other legal entity: specify', 'text', {
          showIf: { key: 'biz.entity', equals: 'other' },
          required: true,
          portal: { portalKey: 'business.legal_entity_other' },
        }),
        q('biz.sector', 'Sector', 'choice', {
          required: true,
          options: [
            { value: 'agro', label: 'Agro-processing / Agriculture' },
            { value: 'manufacturing', label: 'Manufacturing' },
            { value: 'retail', label: 'Retail' },
            { value: 'service', label: 'Services' },
            { value: 'other', label: 'Other (specify)' },
          ],
          portal: { portalKey: 'business.sector_code', portalTransform: (v) => sectorCode(v) },
        }),
        q('biz.sector_other', 'Other sector: specify', 'text', {
          showIf: { key: 'biz.sector', equals: 'other' },
          required: true,
          portal: { portalKey: 'business.sector_other' },
        }),
        q('biz.type', 'Describe the business (what it does, how it fits the stream you chose)', 'textarea', {
          required: true,
          maxLength: 600,
          portal: { portalKey: 'business.description' },
        }),
        q('biz.address', 'Business physical address (must be in a township or rural area)', 'text', { required: true, portal: { portalKey: 'business.physical_address' } }),
        q('biz.province', 'Province (business)', 'choice', {
          required: true,
          options: SA_PROVINCES.map((p) => ({ value: p, label: p })),
          portal: { portalKey: 'business.province' },
        }),
        q('biz.postal_code', 'Postal code (business)', 'number', { required: true, inputMode: 'numeric', maxLength: 4, portal: { portalKey: 'business.postal_code' } }),
        q('biz.years_trading', 'Years in operation', 'number', { required: true, inputMode: 'numeric', maxLength: 3, portal: { portalKey: 'business.years_trading', portalTransform: (v) => toInt(v) } }),
        q('biz.employees', 'Current employees', 'number', { required: true, inputMode: 'numeric', maxLength: 6, portal: { portalKey: 'business.employee_count', portalTransform: (v) => toInt(v) } }),
        q('biz.new_jobs', 'New jobs this funding will create', 'number', { required: true, inputMode: 'numeric', maxLength: 6, portal: { portalKey: 'business.new_jobs', portalTransform: (v) => toInt(v) } }),
      ],
    },
    {
      id: 'ask',
      title: '4. The funding you are asking for',
      intro: 'Whole rand only (no cents). TREP funds working capital, equipment and infrastructure tied to the stream you chose.',
      questions: [
        q('ask.amount', 'Total funding you are asking for (rand)', 'number', {
          required: true,
          inputMode: 'numeric',
          maxLength: 9,
          portal: { portalKey: 'funding.amount', portalTransform: (v) => toInt(v) },
        }),
        q('f.working', 'Working capital (rand)', 'number', { inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'funding.use.working_capital', portalTransform: (v) => toInt(v) } }),
        q('f.equipment', 'Equipment / tools (rand)', 'number', { inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'funding.use.equipment', portalTransform: (v) => toInt(v) } }),
        q('f.renovation', 'Premises / renovation (rand)', 'number', { inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'funding.use.renovation', portalTransform: (v) => toInt(v) } }),
        q('f.stock', 'Stock / inventory (rand)', 'number', { inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'funding.use.stock', portalTransform: (v) => toInt(v) } }),
        q('f.other', 'Other (rand)', 'number', { inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'funding.use.other', portalTransform: (v) => toInt(v) } }),
        q('f.other_purpose', 'If "Other" is filled in, say what for', 'text', { portal: { portalKey: 'funding.use.other_purpose' } }),
      ],
    },
    {
      id: 'docs',
      title: '5. Documents you are attaching in the portal',
      intro: 'Tick what you will upload to the portal. The wizard does not upload anything.',
      questions: [
        q('docs.id', 'Certified ID copy (not older than 3 months)', 'check', { portal: { portalKey: 'documents.certified_id' } }),
        q('docs.cipc', 'CIPC registration documents (if registered)', 'check', { portal: { portalKey: 'documents.cipc' } }),
        q('docs.proof_address', 'Proof of business address in township / rural area', 'check', { portal: { portalKey: 'documents.proof_of_address' } }),
        q('docs.bee', 'B-BBEE certificate / affidavit', 'check', { portal: { portalKey: 'documents.bbbee' } }),
        q('docs.tax', 'SARS tax clearance / compliance PIN', 'check', { portal: { portalKey: 'documents.tax_clearance' } }),
        q('docs.bank', 'Six months of business bank statements', 'check', { portal: { portalKey: 'documents.bank_statements' } }),
        q('docs.quotations', 'Supplier quotations for equipment', 'check', { portal: { portalKey: 'documents.quotations' } }),
        q('docs.lease', 'Lease agreement / letter of intent to lease (if applicable)', 'check', { portal: { portalKey: 'documents.lease' } }),
        q('docs.plan', 'Business plan (especially for new applicants)', 'check', { portal: { portalKey: 'documents.business_plan' } }),
      ],
    },
  ],
  prefill: (src: ProfileSource): AnswerMap => prefillBusinessAndOwner(src),
  validate: (answers: AnswerMap): ValidationResult => {
    const errors: Issue[] = [];
    const warnings: Issue[] = [];
    const ctx: ValidationCtx = { answers, errors, warnings, labels: labelMapFor(SEDFA_TREP.sections as PortalFormSection[]) };
    checkRequired(ctx, SEDFA_TREP.sections as PortalFormSection[]);

    // TREP eligibility gate.
    if (answers['elig.owner_lives_there'] === 'no') {
      err(ctx, 'elig.owner_lives_there', 'TREP requires the owner to live in the same township / rural area as the enterprise.');
    }
    if (answers['elig.sa_national'] === 'no') {
      err(ctx, 'elig.sa_national', 'TREP is only for South African nationals.');
    }

    // TREP funding typically runs to around R1m for stream-level support.
    warnAmountBand(ctx, 'ask.amount', 1_000, 5_000_000, 'TREP');
    const total = sumLines(answers, ['f.working', 'f.equipment', 'f.renovation', 'f.stock', 'f.other']);
    const askAmount = toInt(answers['ask.amount']);
    if (askAmount > 0 && total > 0 && total !== askAmount) {
      warn(ctx, `The funding lines add up to R${total.toLocaleString('en-ZA').replace(/\u00A0/g, ' ')}, but you are asking for R${askAmount.toLocaleString('en-ZA').replace(/\u00A0/g, ' ')}. They should match.`, 'ask.amount');
    }
    if (askAmount > 0 && total === 0) {
      err(ctx, 'f.working', 'Say how the funding will be used (at least one line: working capital, equipment, renovation, stock or other).');
    }

    if (askAmount > 0 && answers['docs.quotations'] !== 'yes') {
      warn(ctx, 'Equipment and renovation lines are paid to suppliers — attach quotations.', 'docs.quotations');
    }
    if (askAmount > 0 && answers['docs.proof_address'] !== 'yes') {
      warn(ctx, 'Attach proof that the business is based in a township / rural area (e.g. utility bill, lease, affidavit).', 'docs.proof_address');
    }

    warnId(ctx, 'owner.id');
    warnAgeRange(ctx, 'owner.age', 18, 75, 'SEDFA ownership');

    return { errors, warnings };
  },
  computed: (a: AnswerMap): AnswerMap => {
    const total = sumLines(a, ['f.working', 'f.equipment', 'f.renovation', 'f.stock', 'f.other']);
    return total > 0 ? { 'f.total': String(total) } : {};
  },
  toPortalJson: function (this: PortalFormTemplate, answers: AnswerMap): Record<string, unknown> {
    const base = defaultPortalJson(this, answers);
    const total = sumLines(answers, ['f.working', 'f.equipment', 'f.renovation', 'f.stock', 'f.other']);
    if (total > 0) {
      const funding = (base['funding'] as Record<string, unknown> | undefined) ?? {};
      funding.total = total;
      base['funding'] = funding;
    }
    base['meta'] = { programme_code: 'trep', portal: 'sedfa-smme-portal' };
    return base;
  },
};
