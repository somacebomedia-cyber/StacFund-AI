// services/portalFormTemplates/sedfaAmavulandlela.ts
/**
 * SEDFA Amavulandlela Funding Scheme — portal template.
 *
 * Amavulandlela is SEDFA's fund for entrepreneurs with disabilities. The scheme
 * offers credit facilities from R50 000 to R15 million at interest below 5%, to
 * businesses that are at least 51% owned AND operationally run by a person with
 * a disability, and are technically feasible and financially sustainable.
 *
 * This template captures the questions the SEDFA eThuse / SMME Portal asks for
 * the Amavulandlela programme, plus the scheme-specific eligibility gate. The
 * wizard emits a JSON object the applicant pastes into the portal — the portal
 * stays the system of record.
 *
 * Sources:
 *   - ThisAbility (19 Mar 2022) on the Sefa Amavulandlela Funding Scheme.
 *   - Netwerk24 (23 Mar 2022) "Disabled get special fund".
 *   - SEDFA Facebook page posts referencing the Amavulandlela consultation sessions.
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

export const SEDFA_AMAVULANDLELA: PortalFormTemplate = {
  id: 'sedfa-amavulandlela-portal',
  title: 'SEDFA Amavulandlela Funding Scheme (portal)',
  portalUrl: 'https://systemsnew.sefa.org.za/SMMEPortal',
  programmeCode: 'amavulandlela',
  matches: (o) => /amavulandlela/i.test(o.programme_name) && /sedfa|sefa|small enterprise/i.test(o.issuer_name),
  intro: [
    'Amavulandlela is SEDFA’s fund for entrepreneurs with disabilities. This template captures the questions the SEDFA eThuse / SMME Portal asks for the Amavulandlela programme, with the scheme’s eligibility gate built in.',
    'Nothing you type is sent to a server or to an AI. You answer the questions here, the wizard writes a JSON object, and you paste it into the portal’s own form. The portal stays the system of record.',
  ],
  rules: [
    'Business must be at least 51% owned by a person (or people) with a disability.',
    'The person with a disability must be operationally involved in the day-to-day running of the business (not a passive shareholder).',
    'The business must be technically feasible and financially sustainable.',
    'Credit facilities run from R50 000 to R15 million at interest below 5%.',
    'South African nationals only; entity must be CIPC-registered.',
  ],
  portalInstructions: [
    'Open the SEDFA eThuse / SMME Portal at systemsnew.sefa.org.za/SMMEPortal and sign in (or register first if you have not).',
    'Choose the Amavulandlela Funding Scheme from the list of programmes.',
    'Copy the JSON below and paste each field into the matching portal input. Where the portal asks for a single choice, paste the code (e.g. "PTY" for Private Company).',
    'The portal also asks you to upload documents — use the checklist on the last screen of this wizard to make sure you have them ready before you start.',
    'The portal may ask additional programme-specific questions that are not on this template. Answer them directly in the portal.',
  ],
  neverFilled: [
    'The portal’s account-registration step (your name, e-mail, password) — that is the portal’s own signup, not the application',
    'The final declaration and "submit" button — those are yours to click in the portal after you have reviewed every page',
    'Anything you leave blank here stays blank in the JSON, so the portal will still ask you for it',
  ],
  sections: [
    {
      id: 'eligibility',
      title: '1. Amavulandlela eligibility',
      intro: 'The scheme is only for businesses owned and run by a person with a disability. The wizard stops you here if the gate fails.',
      questions: [
        q('elig.disability_owner', 'Is the business owned by a person (or people) with a disability?', 'choice', {
          required: true,
          options: YES_NO,
          help: 'If you answer No, the rest of the form will still let you prepare your answers, but the scheme will not accept your application.',
          portal: { portalKey: 'amavulandlela.disability_owner' },
        }),
        q('elig.disability_pct', 'What percentage of the business is owned by the person(s) with a disability?', 'number', {
          required: true,
          inputMode: 'numeric',
          maxLength: 3,
          placeholder: 'e.g. 51',
          showIf: { key: 'elig.disability_owner', equals: 'yes' },
          help: 'The scheme requires at least 51%.',
          portal: { portalKey: 'amavulandlela.disability_ownership_pct', portalTransform: (v) => toInt(v) },
        }),
        q('elig.operationally_involved', 'Is the person with a disability operationally involved in the day-to-day running of the business?', 'choice', {
          required: true,
          options: YES_NO,
          showIf: { key: 'elig.disability_owner', equals: 'yes' },
          help: 'A passive shareholding does not qualify. The person must run the business.',
          portal: { portalKey: 'amavulandlela.operationally_involved' },
        }),
        q('elig.feasible', 'Is the business technically feasible and financially sustainable?', 'choice', {
          required: true,
          options: YES_NO,
          showIf: { key: 'elig.disability_owner', equals: 'yes' },
          help: 'You will be asked for a business plan and cashflow projections in the documents section to back this up.',
          portal: { portalKey: 'amavulandlela.feasible_sustainable' },
        }),
        q('elig.disability_nature', 'Briefly describe the nature of the disability (this goes to SEDFA’s accessibility assessment)', 'textarea', {
          required: true,
          maxLength: 600,
          showIf: { key: 'elig.disability_owner', equals: 'yes' },
          portal: { portalKey: 'amavulandlela.disability_description' },
        }),
      ],
    },
    {
      id: 'owner',
      title: '2. The owner with a disability',
      intro: 'Fill this section for the person with a disability who runs the business. If more than one owner has a disability, list the others in the business section below.',
      questions: [
        q('owner.title', 'Title', 'choice', {
          required: true,
          options: [
            { value: 'mr', label: 'Mr' },
            { value: 'mrs', label: 'Mrs' },
            { value: 'ms', label: 'Ms' },
            { value: 'dr', label: 'Dr' },
            { value: 'prof', label: 'Prof' },
          ],
          portal: { portalKey: 'owner.title' },
        }),
        q('owner.first_names', 'First name(s)', 'text', { required: true, portal: { portalKey: 'owner.first_names' } }),
        q('owner.surname', 'Surname', 'text', { required: true, portal: { portalKey: 'owner.surname' } }),
        q('owner.id', 'RSA ID number', 'number', { required: true, inputMode: 'numeric', maxLength: 13, portal: { portalKey: 'owner.id_number' } }),
        q('owner.gender', 'Gender', 'choice', { required: true, options: GENDERS, portal: { portalKey: 'owner.gender' } }),
        q('owner.age', 'Age', 'number', { required: true, inputMode: 'numeric', maxLength: 3, portal: { portalKey: 'owner.age', portalTransform: (v) => toInt(v) } }),
        q('owner.population', 'Population group', 'choice', { required: true, options: POPULATION_GROUPS, portal: { portalKey: 'owner.population_group' } }),
        q('owner.nationality', 'Nationality', 'text', { required: true, placeholder: 'South African', portal: { portalKey: 'owner.nationality' } }),
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
      intro: 'Tell SEDFA about the business itself.',
      questions: [
        q('biz.name', 'Registered business name', 'text', { required: true, portal: { portalKey: 'business.registered_name' } }),
        q('biz.trading_name', 'Trading name (if different)', 'text', { portal: { portalKey: 'business.trading_name' } }),
        q('biz.reg_number', 'CIPC registration number', 'text', { required: true, placeholder: 'e.g. 2021/123456/07', portal: { portalKey: 'business.cipc_number' } }),
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
      intro: 'Whole rand only (no cents). The scheme pays suppliers directly against quotations for asset purchases; working capital goes to your business account.',
      questions: [
        q('ask.amount', 'Total funding you are asking for (rand)', 'number', {
          required: true,
          inputMode: 'numeric',
          maxLength: 10,
          portal: { portalKey: 'funding.amount', portalTransform: (v) => toInt(v) },
        }),
        q('ask.term_months', 'Repayment term (months)', 'number', {
          required: true,
          inputMode: 'numeric',
          maxLength: 3,
          placeholder: 'e.g. 60',
          portal: { portalKey: 'funding.term_months', portalTransform: (v) => toInt(v) },
        }),
        q('f.equipment', 'Equipment / machinery (rand)', 'number', { inputMode: 'numeric', maxLength: 10, portal: { portalKey: 'funding.use.equipment', portalTransform: (v) => toInt(v) } }),
        q('f.working', 'Working capital (rand)', 'number', { inputMode: 'numeric', maxLength: 10, portal: { portalKey: 'funding.use.working_capital', portalTransform: (v) => toInt(v) } }),
        q('f.stock', 'Stock / inventory (rand)', 'number', { inputMode: 'numeric', maxLength: 10, portal: { portalKey: 'funding.use.stock', portalTransform: (v) => toInt(v) } }),
        q('f.other', 'Other (rand)', 'number', { inputMode: 'numeric', maxLength: 10, portal: { portalKey: 'funding.use.other', portalTransform: (v) => toInt(v) } }),
        q('f.other_purpose', 'If "Other" is filled in, say what for', 'text', { portal: { portalKey: 'funding.use.other_purpose' } }),
      ],
    },
    {
      id: 'docs',
      title: '5. Documents you are attaching in the portal',
      intro: 'Tick what you will upload to the portal. The wizard does not upload anything — these ticks just help you keep track.',
      questions: [
        q('docs.id', 'Certified ID copy of the owner with a disability (not older than 3 months)', 'check', { portal: { portalKey: 'documents.certified_id' } }),
        q('docs.cipc', 'CIPC registration documents (CK2 / CK14.3 / Cor21.3)', 'check', { portal: { portalKey: 'documents.cipc' } }),
        q('docs.bee', 'B-BBEE certificate / affidavit', 'check', { portal: { portalKey: 'documents.bbbee' } }),
        q('docs.tax', 'SARS tax clearance / compliance PIN', 'check', { portal: { portalKey: 'documents.tax_clearance' } }),
        q('docs.bank', 'Six months of business and personal bank statements', 'check', { portal: { portalKey: 'documents.bank_statements' } }),
        q('docs.quotations', 'Supplier quotations for asset purchases', 'check', { portal: { portalKey: 'documents.quotations' } }),
        q('docs.plan', 'Business plan', 'check', { portal: { portalKey: 'documents.business_plan' } }),
        q('docs.cashflow', '36-month cashflow projections with assumptions', 'check', { portal: { portalKey: 'documents.cashflow_projections' } }),
        q('docs.disability', 'Medical / disability documentation (where applicable)', 'check', { portal: { portalKey: 'documents.disability_proof' } }),
        q('docs.resolution', 'Members / shareholders resolution to apply', 'check', { portal: { portalKey: 'documents.resolution' } }),
      ],
    },
  ],
  prefill: (src: ProfileSource): AnswerMap => {
    const a = prefillBusinessAndOwner(src);
    // Amavulandlela also asks for nationality (defaults to South African since
    // the scheme requires SA nationals).
    if (!a['owner.nationality']) a['owner.nationality'] = 'South African';
    return a;
  },
  validate: (answers: AnswerMap): ValidationResult => {
    const errors: Issue[] = [];
    const warnings: Issue[] = [];
    const ctx: ValidationCtx = { answers, errors, warnings, labels: labelMapFor(SEDFA_AMAVULANDLELA.sections as PortalFormSection[]) };
    checkRequired(ctx, SEDFA_AMAVULANDLELA.sections as PortalFormSection[]);

    // Amavulandlela eligibility gate.
    if (answers['elig.disability_owner'] === 'yes') {
      const pct = toInt(answers['elig.disability_pct']);
      if (pct > 0 && pct < 51) {
        err(ctx, 'elig.disability_pct', `The scheme needs at least 51% disability ownership. You entered ${pct}%.`);
      }
      if (answers['elig.operationally_involved'] === 'no') {
        err(ctx, 'elig.operationally_involved', 'The person with a disability must be operationally involved in running the business. A passive shareholding does not qualify.');
      }
      if (answers['elig.feasible'] === 'no') {
        err(ctx, 'elig.feasible', 'Amavulandlela only funds businesses that are technically feasible and financially sustainable.');
      }
    } else if (answers['elig.disability_owner'] === 'no') {
      warn(ctx, 'Amavulandlela is only for businesses owned by a person with a disability. The portal will likely reject this application.', 'elig.disability_owner');
    }

    // Funding band: R50K to R15M.
    warnAmountBand(ctx, 'ask.amount', 50_000, 15_000_000, 'Amavulandlela');
    const total = sumLines(answers, ['f.equipment', 'f.working', 'f.stock', 'f.other']);
    const askAmount = toInt(answers['ask.amount']);
    if (askAmount > 0 && total > 0 && total !== askAmount) {
      warn(ctx, `The funding lines add up to R${total.toLocaleString('en-ZA').replace(/\u00A0/g, ' ')}, but you are asking for R${askAmount.toLocaleString('en-ZA').replace(/\u00A0/g, ' ')}. They should match.`, 'ask.amount');
    }
    if (askAmount > 0 && total === 0) {
      err(ctx, 'f.equipment', 'Say how the funding will be used (at least one line: equipment, working capital, stock or other).');
    }

    // Term: Amavulandlela loans are unsecured-style and short-to-medium term; warn past 60.
    const term = toInt(answers['ask.term_months']);
    if (term > 60) warn(ctx, 'Amavulandlela loans typically run up to 60 months. Confirm your term with the portal.', 'ask.term_months');

    // Document reminders.
    if (askAmount > 0 && answers['docs.quotations'] !== 'yes') {
      warn(ctx, 'Asset purchases are paid directly to suppliers — attach quotations (item 6 of the documents list).', 'docs.quotations');
    }
    if (askAmount > 0 && answers['docs.cashflow'] !== 'yes') {
      warn(ctx, 'Amavulandlela requires 36-month cashflow projections with assumptions.', 'docs.cashflow');
    }
    if (answers['elig.disability_owner'] === 'yes' && answers['docs.disability'] !== 'yes') {
      warn(ctx, 'Attach medical / disability documentation for the owner with a disability.', 'docs.disability');
    }

    // Sanity.
    warnId(ctx, 'owner.id');
    warnAgeRange(ctx, 'owner.age', 18, 75, 'SEDFA ownership');

    return { errors, warnings };
  },
  computed: (a: AnswerMap): AnswerMap => {
    const total = sumLines(a, ['f.equipment', 'f.working', 'f.stock', 'f.other']);
    return total > 0 ? { 'f.total': String(total) } : {};
  },
  toPortalJson: function (this: PortalFormTemplate, answers: AnswerMap): Record<string, unknown> {
    const base = defaultPortalJson(this, answers);
    const total = sumLines(answers, ['f.equipment', 'f.working', 'f.stock', 'f.other']);
    if (total > 0) {
      const funding = (base['funding'] as Record<string, unknown> | undefined) ?? {};
      funding.total = total;
      base['funding'] = funding;
    }
    base['meta'] = { programme_code: 'amavulandlela', portal: 'sedfa-smme-portal' };
    return base;
  },
};
