// services/portalFormTemplates/nydaErpGrant.ts
/**
 * NYDA ERP Portal — Grant Programme portal template.
 *
 * NYDA's online ERP Portal (erp.nyda.gov.za) is the official online path for
 * the Grant and Voucher programmes. The portal replaces the static "Grant -
 * Voucher 17 Feb 2016 Draft No 1" PDF that is still handed out at branches.
 *
 * The questions on this template mirror the paper NYDA Voucher & Grant form
 * (see services/formTemplates/nydaGrantVoucher.ts) for the Section A, B, D, E,
 * F and G content, but emit a JSON object the applicant pastes into the ERP
 * Portal's online application pages.
 *
 * Sources:
 *   - NYDA ERP Portal landing page (erp.nyda.gov.za) — login wall, but the
 *     portal's grant application flow mirrors the paper form's sections.
 *   - NYDA Grant Programme public page (srdtool.co.za/nyda-grant) — eligibility,
 *     amounts, documents.
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
  SECTORS,
  YES_NO,
  checkRequired,
  defaultPortalJson,
  entityCode,
  err,
  labelMapFor,
  prefillClientA,
  q,
  sectorCode,
  warn,
  warnAgeRange,
  warnAmountBand,
  warnId,
  type ValidationCtx,
} from './portalShared';

const GEO = [
  { value: 'urban', label: 'Urban' },
  { value: 'rural', label: 'Rural' },
];

export const NYDA_ERP_GRANT: PortalFormTemplate = {
  id: 'nyda-erp-grant-portal',
  title: 'NYDA ERP Portal — Grant Programme (portal)',
  portalUrl: 'https://erp.nyda.gov.za',
  programmeCode: 'nyda_grant',
  matches: (o) => /nyda|national youth development agency/i.test(o.issuer_name) && /grant|micro finance|voucher/i.test(o.programme_name),
  intro: [
    'NYDA’s ERP Portal is the online path for the Grant Programme (R1 000 to R250 000, paid to suppliers against quotations). This template mirrors the paper Grant & Voucher form’s sections A, B, D/E, F and G, and emits a JSON object you paste into the portal.',
    'Nothing you type is sent to a server or to an AI. You answer here, the wizard writes a JSON object, and you paste it into the portal. The portal stays the system of record.',
  ],
  rules: [
    'South African citizen aged 18 to 35, living in South Africa.',
    'Business must be 100% youth owned (formal or informal).',
    'Grants run from R1 000 to R250 000 and are paid to suppliers against quotations — not to you in cash.',
    'You must have the skills or experience to run the business, or be willing to attend business management training.',
    'A business plan is required for grants above R50 000.',
  ],
  portalInstructions: [
    'Open the NYDA ERP Portal at erp.nyda.gov.za and sign in (or register first — the portal requires its own account).',
    'Choose the Grant Programme from the list of available programmes.',
    'Copy the JSON below and paste each field into the matching portal input. Where the portal asks for a single choice, paste the code (e.g. "AGRO" for Agro-processing).',
    'Upload the supporting documents on the portal’s documents page using the checklist below as your guide.',
    'If you would rather fill the paper form and hand it in at a branch, use the NYDA Voucher and Grant Client Application Form template instead.',
  ],
  neverFilled: [
    'The portal’s account-registration step — that is the portal’s own signup, not the grant application',
    'The final declaration and "submit" button — those are yours to click in the portal',
    'The branch-use boxes (Branch Name, Date of Application, GR no / BCS no) — the portal fills those from your account',
    'Anything you leave blank here stays blank in the JSON, so the portal will still ask you for it',
  ],
  sections: [
    {
      id: 'a',
      title: 'A. Your details',
      questions: [
        q('a.first_names', 'First names (as on your ID)', 'text', { required: true, portal: { portalKey: 'client.first_names' } }),
        q('a.surname', 'Surname', 'text', { required: true, portal: { portalKey: 'client.surname' } }),
        q('a.id', 'RSA ID number', 'number', { required: true, inputMode: 'numeric', maxLength: 13, portal: { portalKey: 'client.id_number' } }),
        q('a.gender', 'Gender', 'choice', { required: true, options: GENDERS, portal: { portalKey: 'client.gender' } }),
        q('a.age', 'Age', 'number', { required: true, inputMode: 'numeric', maxLength: 3, portal: { portalKey: 'client.age', portalTransform: (v) => toInt(v) } }),
        q('a.population', 'Population group', 'choice', { required: true, options: POPULATION_GROUPS, portal: { portalKey: 'client.population_group' } }),
        q('a.home_language', 'Home language', 'text', { required: true, portal: { portalKey: 'client.home_language' } }),
        q('a.disability', 'Do you have a disability?', 'choice', { required: true, options: YES_NO, portal: { portalKey: 'client.disability' } }),
        q('a.disability_details', 'If Yes, describe the disability', 'text', {
          showIf: { key: 'a.disability', equals: 'yes' },
          required: true,
          portal: { portalKey: 'client.disability_description' },
        }),
        q('a.cell', 'Cell number', 'text', { required: true, inputMode: 'tel', portal: { portalKey: 'client.contact.cell' } }),
        q('a.email', 'E-mail address', 'text', { required: true, inputMode: 'email', portal: { portalKey: 'client.contact.email' } }),
        q('a.address', 'Physical address', 'text', { required: true, portal: { portalKey: 'client.contact.physical_address' } }),
        q('a.postal_code', 'Postal code', 'number', { required: true, inputMode: 'numeric', maxLength: 4, portal: { portalKey: 'client.contact.postal_code' } }),
        q('a.province', 'Province', 'choice', {
          required: true,
          options: SA_PROVINCES.map((p) => ({ value: p, label: p })),
          portal: { portalKey: 'client.contact.province' },
        }),
        q('a.geo', 'Geographic type', 'choice', { required: true, options: GEO, portal: { portalKey: 'client.geo_type' } }),
      ],
    },
    {
      id: 'b',
      title: 'B. Entrepreneurial status',
      intro: 'Section B is compulsory for everyone. The answer decides which business section the portal fills for you.',
      questions: [
        q('b.existing', 'Do you have an existing business that is currently in operation?', 'choice', {
          required: true,
          options: YES_NO,
          help: 'Yes fills the existing-business block; No fills the start-up block. Section F (the grant) is always filled.',
          portal: { portalKey: 'entrepreneurial.existing_business' },
        }),
        q('b.trained', 'Have you ever received any Entrepreneurship Development Training?', 'choice', {
          required: true,
          options: YES_NO,
          portal: { portalKey: 'entrepreneurial.trained' },
        }),
      ],
    },
    {
      id: 'kin',
      title: 'Next of kin',
      questions: [
        q('a.nok_name', 'Next of kin: name and surname', 'text', { required: true, portal: { portalKey: 'client.next_of_kin.name' } }),
        q('a.nok_cell', 'Next of kin: cell number', 'text', { required: true, inputMode: 'tel', portal: { portalKey: 'client.next_of_kin.cell' } }),
        q('a.nok_relationship', 'Next of kin: relationship to you', 'text', { required: true, portal: { portalKey: 'client.next_of_kin.relationship' } }),
      ],
    },
    {
      id: 'biz',
      title: 'Your business (Sections D / E / F)',
      intro: 'Asked once, written into the sections that apply to your application.',
      questions: [
        q('biz.name', 'Business name', 'text', { required: true, portal: { portalKey: 'business.name' } }),
        q('biz.type', 'Type of business (what it does)', 'text', { required: true, portal: { portalKey: 'business.type' } }),
        q('biz.sector', 'Sector', 'choice', {
          required: true,
          options: SECTORS.map((s) => ({ value: s.value, label: s.label })),
          portal: { portalKey: 'business.sector_code', portalTransform: (v) => sectorCode(v) },
        }),
        q('biz.sector_other', 'Other sector: specify', 'text', {
          showIf: { key: 'biz.sector', equals: 'other' },
          required: true,
          portal: { portalKey: 'business.sector_other' },
        }),
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
      ],
    },
    {
      id: 'f',
      title: 'F. The grant you are asking for',
      intro: 'Whole rand only (no cents). The grant pays suppliers directly against quotations.',
      questions: [
        q('f.amount', 'Grant amount required (rand)', 'number', { required: true, inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'grant.amount', portalTransform: (v) => toInt(v) } }),
        q('f.use.1.what', 'Use of funds 1: what you will buy', 'text', { portal: { portalKey: 'grant.use.1.description' } }),
        q('f.use.1.amount', 'Use of funds 1: amount (rand)', 'number', { inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'grant.use.1.amount', portalTransform: (v) => toInt(v) } }),
        q('f.use.2.what', 'Use of funds 2: what you will buy', 'text', { portal: { portalKey: 'grant.use.2.description' } }),
        q('f.use.2.amount', 'Use of funds 2: amount (rand)', 'number', { inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'grant.use.2.amount', portalTransform: (v) => toInt(v) } }),
        q('f.use.3.what', 'Use of funds 3: what you will buy', 'text', { portal: { portalKey: 'grant.use.3.description' } }),
        q('f.use.3.amount', 'Use of funds 3: amount (rand)', 'number', { inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'grant.use.3.amount', portalTransform: (v) => toInt(v) } }),
        q('f.use.4.what', 'Use of funds 4: what you will buy', 'text', { portal: { portalKey: 'grant.use.4.description' } }),
        q('f.use.4.amount', 'Use of funds 4: amount (rand)', 'number', { inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'grant.use.4.amount', portalTransform: (v) => toInt(v) } }),
        q('f.use.5.what', 'Use of funds 5: what you will buy', 'text', { portal: { portalKey: 'grant.use.5.description' } }),
        q('f.use.5.amount', 'Use of funds 5: amount (rand)', 'number', { inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'grant.use.5.amount', portalTransform: (v) => toInt(v) } }),
      ],
    },
    {
      id: 'g',
      title: 'G. Documents you are attaching in the portal',
      intro: 'Tick only what you will really upload. The wizard does not upload anything.',
      questions: [
        q('g.1', 'Certified Identity document copy (stamp not older than 3 months)', 'check', { portal: { portalKey: 'documents.certified_id' } }),
        q('g.2', 'Proof of Residence', 'check', { portal: { portalKey: 'documents.proof_of_residence' } }),
        q('g.3', 'Copy of Company Registration from CIPC (if registered)', 'check', { portal: { portalKey: 'documents.cipc' } }),
        q('g.4', 'Company Profile', 'check', { portal: { portalKey: 'documents.company_profile' } }),
        q('g.5', 'Detailed list of the current employees', 'check', { portal: { portalKey: 'documents.employee_list' } }),
        q('g.6', 'Personal or Business Bank Statement', 'check', { portal: { portalKey: 'documents.bank_statements' } }),
        q('g.7', 'Business Plan (needed for grants above R50 000)', 'check', { portal: { portalKey: 'documents.business_plan' } }),
        q('g.8', 'Quotations (needed when applying for a grant)', 'check', { portal: { portalKey: 'documents.quotations' } }),
        q('g.9', 'Any other document that might be required', 'check', { portal: { portalKey: 'documents.other' } }),
      ],
    },
  ],
  prefill: (src: ProfileSource): AnswerMap => prefillClientA(src),
  validate: (answers: AnswerMap): ValidationResult => {
    const errors: Issue[] = [];
    const warnings: Issue[] = [];
    const ctx: ValidationCtx = { answers, errors, warnings, labels: labelMapFor(NYDA_ERP_GRANT.sections as PortalFormSection[]) };
    checkRequired(ctx, NYDA_ERP_GRANT.sections as PortalFormSection[]);

    warnAmountBand(ctx, 'f.amount', 1_000, 250_000, 'NYDA grant');

    const lines = [1, 2, 3, 4, 5].map((n) => toInt(answers[`f.use.${n}.amount`]));
    const total = lines.reduce((x, y) => x + y, 0);
    const filled = [1, 2, 3, 4, 5].filter((n) => !!(answers[`f.use.${n}.what`] || answers[`f.use.${n}.amount`]));
    if (filled.length === 0) {
      err(ctx, 'f.use.1.what', 'Say how the grant will be used (at least one line of the utilisation table).');
    }
    for (const n of filled) {
      if (!answers[`f.use.${n}.what`]) err(ctx, `f.use.${n}.what`, `Line ${n}: say what the money will buy.`);
      if (toInt(answers[`f.use.${n}.amount`]) === 0) err(ctx, `f.use.${n}.amount`, `Line ${n}: give the amount.`);
    }
    const amount = toInt(answers['f.amount']);
    if (amount > 0 && total > 0 && total !== amount) {
      warn(ctx, `The utilisation lines add up to R${total.toLocaleString('en-ZA').replace(/\u00A0/g, ' ')}, but you are asking for R${amount.toLocaleString('en-ZA').replace(/\u00A0/g, ' ')}. They should match.`, 'f.use.1.amount');
    }

    if (amount > 50_000 && answers['g.7'] !== 'yes') {
      warn(ctx, 'A grant above R50 000 needs a business plan (item 7 of the checklist).', 'g.7');
    }
    if (amount > 0 && answers['g.8'] !== 'yes') {
      warn(ctx, 'Grants are paid to suppliers against quotations, so attach quotations (item 8 of the checklist).', 'g.8');
    }

    warnId(ctx, 'a.id');
    warnAgeRange(ctx, 'a.age', 18, 35, 'The NYDA grant');

    return { errors, warnings };
  },
  computed: (a: AnswerMap): AnswerMap => {
    const total = [1, 2, 3, 4, 5].reduce((sum, n) => sum + toInt(a[`f.use.${n}.amount`]), 0);
    return total > 0 ? { 'f.total': String(total) } : {};
  },
  toPortalJson: function (this: PortalFormTemplate, answers: AnswerMap): Record<string, unknown> {
    const base = defaultPortalJson(this, answers);
    const total = [1, 2, 3, 4, 5].reduce((sum, n) => sum + toInt(answers[`f.use.${n}.amount`]), 0);
    if (total > 0) {
      const grant = (base['grant'] as Record<string, unknown> | undefined) ?? {};
      grant.total = total;
      base['grant'] = grant;
    }
    base['meta'] = { programme_code: 'nyda_grant', portal: 'nyda-erp' };
    return base;
  },
};
