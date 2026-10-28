// services/portalFormTemplates/sedfaPeoPleYouth.ts
/**
 * SEDFA Peo Pele Youth Fund — portal template.
 *
 * Peo Pele is SEDFA's youth-focused fund. It targets South African youth (18-35)
 * running early-stage businesses, with concessional credit and grant blending.
 * The scheme is part of SEDFA's broader SMME Portal suite and is delivered
 * alongside the youth development support offered by NYDA and SEDA.
 *
 * This template captures the questions the SEDFA eThuse / SMME Portal asks for
 * the Peo Pele Youth Fund, plus the youth-ownership eligibility gate.
 *
 * Sources:
 *   - SEDFA / DSBD Facebook posts on Peo Pele Youth Fund consultation sessions.
 *   - Public SEDFA programme briefs describing Peo Pele as a youth fund.
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

export const SEDFA_PEO_PLE_YOUTH: PortalFormTemplate = {
  id: 'sedfa-peo-ple-youth-portal',
  title: 'SEDFA Peo Pele Youth Fund (portal)',
  portalUrl: 'https://systemsnew.sefa.org.za/SMMEPortal',
  programmeCode: 'peo_ple_youth',
  matches: (o) => /peo\s*ple|peo\s*pele/i.test(o.programme_name) && /sedfa|sefa|small enterprise|dsbd/i.test(o.issuer_name),
  intro: [
    'Peo Pele is SEDFA’s youth fund for South Africans aged 18 to 35 running early-stage businesses. This template captures the questions the SEDFA eThuse / SMME Portal asks for Peo Pele, including the youth-ownership gate.',
    'Nothing you type is sent to a server or to an AI. You answer here, the wizard writes a JSON object, and you paste it into the portal. The portal stays the system of record.',
  ],
  rules: [
    'South African citizens aged 18 to 35.',
    'Business must be at least 51% youth-owned (people aged 18-35). For a sole owner, that means 100%.',
    'Business must be in the early-stage / start-up phase (typically less than 3 years trading).',
    'Concessional credit with a blended grant component depending on developmental impact.',
    'Funding is paid to suppliers against quotations for assets; working capital goes to the business account.',
  ],
  portalInstructions: [
    'Open the SEDFA eThuse / SMME Portal at systemsnew.sefa.org.za/SMMEPortal and sign in (or register first if you have not).',
    'Choose Peo Pele Youth Fund from the list of programmes.',
    'Copy the JSON below and paste each field into the matching portal input. Where the portal asks for a single choice, paste the code (e.g. "PTY" for Private Company).',
    'The portal will also ask you to upload documents — use the checklist on the last screen of this wizard to keep track of what you need.',
  ],
  neverFilled: [
    'The portal’s account-registration step — that is the portal’s own signup, not the application',
    'The final declaration and "submit" button — those are yours to click in the portal',
    'Anything you leave blank here stays blank in the JSON, so the portal will still ask you for it',
  ],
  sections: [
    {
      id: 'eligibility',
      title: '1. Peo Pele eligibility',
      questions: [
        q('elig.youth_owner', 'Is the business owned by a young person (or people) aged 18 to 35?', 'choice', {
          required: true,
          options: YES_NO,
          help: 'If you answer No, the rest of the form will still let you prepare your answers, but Peo Pele will not accept your application.',
          portal: { portalKey: 'peo_ple.youth_owner' },
        }),
        q('elig.youth_pct', 'What percentage of the business is owned by youth (18-35)?', 'number', {
          required: true,
          inputMode: 'numeric',
          maxLength: 3,
          placeholder: 'e.g. 100',
          showIf: { key: 'elig.youth_owner', equals: 'yes' },
          help: 'Peo Pele requires at least 51% youth ownership. A sole owner is 100%.',
          portal: { portalKey: 'peo_ple.youth_ownership_pct', portalTransform: (v) => toInt(v) },
        }),
        q('elig.startup', 'Is this an early-stage / start-up business (typically less than 3 years trading)?', 'choice', {
          required: true,
          options: YES_NO,
          showIf: { key: 'elig.youth_owner', equals: 'yes' },
          help: 'Peo Pele targets early-stage businesses. Established businesses should look at SEDFA Term Loan or Asset Finance instead.',
          portal: { portalKey: 'peo_ple.is_startup' },
        }),
      ],
    },
    {
      id: 'owner',
      title: '2. The young owner',
      intro: 'Fill this for the young person who runs the business.',
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
        q('owner.address', 'Residential address', 'text', { required: true, portal: { portalKey: 'owner.contact.physical_address' } }),
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
          options: SECTORS.map((s) => ({ value: s.value, label: s.label })),
          portal: { portalKey: 'business.sector_code', portalTransform: (v) => sectorCode(v) },
        }),
        q('biz.sector_other', 'Other sector: specify', 'text', {
          showIf: { key: 'biz.sector', equals: 'other' },
          required: true,
          portal: { portalKey: 'business.sector_other' },
        }),
        q('biz.type', 'Brief description of what the business does', 'textarea', { required: true, maxLength: 600, portal: { portalKey: 'business.description' } }),
        q('biz.address', 'Business physical address', 'text', { required: true, portal: { portalKey: 'business.physical_address' } }),
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
      intro: 'Whole rand only (no cents). Peo Pele blends concessional credit with a grant component; the portal works out the split based on developmental scoring.',
      questions: [
        q('ask.amount', 'Total funding you are asking for (rand)', 'number', {
          required: true,
          inputMode: 'numeric',
          maxLength: 9,
          portal: { portalKey: 'funding.amount', portalTransform: (v) => toInt(v) } ,
        }),
        q('f.equipment', 'Equipment / machinery (rand)', 'number', { inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'funding.use.equipment', portalTransform: (v) => toInt(v) } }),
        q('f.working', 'Working capital (rand)', 'number', { inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'funding.use.working_capital', portalTransform: (v) => toInt(v) } }),
        q('f.stock', 'Stock / inventory (rand)', 'number', { inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'funding.use.stock', portalTransform: (v) => toInt(v) } }),
        q('f.training', 'Skills / training (rand)', 'number', { inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'funding.use.training', portalTransform: (v) => toInt(v) } }),
        q('f.other', 'Other (rand)', 'number', { inputMode: 'numeric', maxLength: 9, portal: { portalKey: 'funding.use.other', portalTransform: (v) => toInt(v) } }),
        q('f.other_purpose', 'If "Other" is filled in, say what for', 'text', { portal: { portalKey: 'funding.use.other_purpose' } }),
      ],
    },
    {
      id: 'docs',
      title: '5. Documents you are attaching in the portal',
      intro: 'Tick what you will upload to the portal.',
      questions: [
        q('docs.id', 'Certified ID copy (not older than 3 months)', 'check', { portal: { portalKey: 'documents.certified_id' } }),
        q('docs.cipc', 'CIPC registration documents (if registered)', 'check', { portal: { portalKey: 'documents.cipc' } }),
        q('docs.proof_address', 'Proof of business address', 'check', { portal: { portalKey: 'documents.proof_of_address' } }),
        q('docs.bee', 'B-BBEE certificate / affidavit', 'check', { portal: { portalKey: 'documents.bbbee' } }),
        q('docs.tax', 'SARS tax clearance / compliance PIN (if registered)', 'check', { portal: { portalKey: 'documents.tax_clearance' } }),
        q('docs.bank', 'Three to six months of bank statements', 'check', { portal: { portalKey: 'documents.bank_statements' } }),
        q('docs.quotations', 'Supplier quotations for asset purchases', 'check', { portal: { portalKey: 'documents.quotations' } }),
        q('docs.plan', 'Business plan / business profile', 'check', { portal: { portalKey: 'documents.business_plan' } }),
        q('docs.cashflow', '12- to 24-month cashflow projections', 'check', { portal: { portalKey: 'documents.cashflow_projections' } }),
      ],
    },
  ],
  prefill: (src: ProfileSource): AnswerMap => prefillBusinessAndOwner(src),
  validate: (answers: AnswerMap): ValidationResult => {
    const errors: Issue[] = [];
    const warnings: Issue[] = [];
    const ctx: ValidationCtx = { answers, errors, warnings, labels: labelMapFor(SEDFA_PEO_PLE_YOUTH.sections as PortalFormSection[]) };
    checkRequired(ctx, SEDFA_PEO_PLE_YOUTH.sections as PortalFormSection[]);

    if (answers['elig.youth_owner'] === 'yes') {
      const pct = toInt(answers['elig.youth_pct']);
      if (pct > 0 && pct < 51) {
        err(ctx, 'elig.youth_pct', `Peo Pele needs at least 51% youth ownership. You entered ${pct}%.`);
      }
      if (answers['elig.startup'] === 'no') {
        warn(ctx, 'Peo Pele targets early-stage / start-up businesses. Established businesses should consider SEDFA Term Loan or Asset Finance.', 'elig.startup');
      }
    } else if (answers['elig.youth_owner'] === 'no') {
      warn(ctx, 'Peo Pele is only for businesses owned by young people aged 18 to 35. The portal will likely reject this application.', 'elig.youth_owner');
    }

    warnAmountBand(ctx, 'ask.amount', 1_000, 5_000_000, 'Peo Pele');
    const total = sumLines(answers, ['f.equipment', 'f.working', 'f.stock', 'f.training', 'f.other']);
    const askAmount = toInt(answers['ask.amount']);
    if (askAmount > 0 && total > 0 && total !== askAmount) {
      warn(ctx, `The funding lines add up to R${total.toLocaleString('en-ZA').replace(/\u00A0/g, ' ')}, but you are asking for R${askAmount.toLocaleString('en-ZA').replace(/\u00A0/g, ' ')}. They should match.`, 'ask.amount');
    }
    if (askAmount > 0 && total === 0) {
      err(ctx, 'f.equipment', 'Say how the funding will be used (at least one line: equipment, working capital, stock, training or other).');
    }

    if (askAmount > 0 && answers['docs.quotations'] !== 'yes') {
      warn(ctx, 'Asset purchases are paid to suppliers — attach quotations.', 'docs.quotations');
    }
    if (askAmount > 0 && answers['docs.cashflow'] !== 'yes') {
      warn(ctx, 'Peo Pele requires 12- to 24-month cashflow projections.', 'docs.cashflow');
    }

    warnId(ctx, 'owner.id');
    warnAgeRange(ctx, 'owner.age', 18, 35, 'Peo Pele ownership');

    return { errors, warnings };
  },
  computed: (a: AnswerMap): AnswerMap => {
    const total = sumLines(a, ['f.equipment', 'f.working', 'f.stock', 'f.training', 'f.other']);
    return total > 0 ? { 'f.total': String(total) } : {};
  },
  toPortalJson: function (this: PortalFormTemplate, answers: AnswerMap): Record<string, unknown> {
    const base = defaultPortalJson(this, answers);
    const total = sumLines(answers, ['f.equipment', 'f.working', 'f.stock', 'f.training', 'f.other']);
    if (total > 0) {
      const funding = (base['funding'] as Record<string, unknown> | undefined) ?? {};
      funding.total = total;
      base['funding'] = funding;
    }
    base['meta'] = { programme_code: 'peo_ple_youth', portal: 'sedfa-smme-portal' };
    return base;
  },
};
