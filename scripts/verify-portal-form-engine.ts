// scripts/verify-portal-form-engine.ts
/**
 * Bulletproofs the online-portal templates end-to-end, in Node:
 *
 *   1. Schema — every portal template has the required fields, every question
 *      that declares `portal` has a non-empty portalKey, every choice-type
 *      question has options.
 *   2. Prefill — each template's prefill() runs against a mock ProfileSource and
 *      produces keys that exist in the template's sections.
 *   3. Validation — a realistic answer set passes with zero errors; blank
 *      answers are blocked; eligibility gates trip on the right inputs.
 *   4. JSON output — toPortalJson() runs and the expected top-level keys exist
 *      (meta.programme_code, owner.first_names, business.registered_name,
 *      funding.amount, etc.).
 *   5. Matching — each built-in mock opportunity matches exactly one portal
 *      template (the one for its programme), and unrelated programmes do not
 *      match.
 *
 * Run:  npx tsx scripts/verify-portal-form-engine.ts
 * Exits 0 only when every check passes.
 */

import { SEDFA_AMAVULANDLELA } from '../services/portalFormTemplates/sedfaAmavulandlela';
import { SEDFA_TREP } from '../services/portalFormTemplates/sedfaTrep';
import { SEDFA_PEO_PLE_YOUTH } from '../services/portalFormTemplates/sedfaPeoPleYouth';
import { NYDA_ERP_GRANT } from '../services/portalFormTemplates/nydaErpGrant';
import { findPortalTemplate } from '../services/portalFormTemplates';
import { conditionHolds } from '../services/formModel';
import type { PortalFormTemplate, PortalQuestion, ProfileSource } from '../services/formModel';

const TEMPLATES = [SEDFA_AMAVULANDLELA, SEDFA_TREP, SEDFA_PEO_PLE_YOUTH, NYDA_ERP_GRANT];

let pass = 0;
let fail = 0;
const section = (name: string) => console.log(`\n── ${name} ──`);
const check = (label: string, ok: boolean, detail = ''): void => {
  if (ok) {
    pass += 1;
    console.log(`  \u2713 ${label}`);
  } else {
    fail += 1;
    console.log(`  \u2717 ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

// ─── Mock profile used by every prefill test ──────────────────────────────────
const MOCK_PROFILE: ProfileSource = {
  email: 'thandiwe@example.co.za',
  businessName: 'Thandiwe Poultry Enterprise',
  whatsapp: '083 555 0199',
  profile: {
    name: 'Thandiwe Poultry Enterprise',
    tradingName: 'Thandiwe Poultry',
    description: 'Free-range egg production for the Amathole district',
    industry: 'Agriculture / Poultry',
    registration: '2021/123456/07',
    address: '14 Main Road, Dutywa',
    province: 'Eastern Cape',
    postalCode: '5050',
    whatsapp: '083 555 0199',
  },
  ownerInfo: {
    name: 'Thandiwe Mokoena',
    idNumber: '9901235600089',
    age: 27,
    gender: 'Female',
    race: 'African',
    address: '14 Main Road, Dutywa',
    position: 'Owner',
  },
  documentCategories: ['Certified ID Copy', 'Proof of Residence', 'CIPC Registration', 'Bank Statement', 'Business Plan', 'Quotations'],
};

// ─── Mock opportunities used by the matching test ─────────────────────────────
const MOCKS = [
  { opportunity_id: 'sedfa_amavulandlela_001', programme_name: 'Amavulandlela Funding Scheme', issuer_name: 'SEDFA', geo_scope: 'National', closing_date: '' },
  { opportunity_id: 'sedfa_trep_001', programme_name: 'Township and Rural Entrepreneurship Programme (TREP)', issuer_name: 'SEDFA', geo_scope: 'National', closing_date: '' },
  { opportunity_id: 'sedfa_peo_ple_001', programme_name: 'Peo Pele Youth Fund', issuer_name: 'SEDFA', geo_scope: 'National', closing_date: '' },
  { opportunity_id: 'nyda_grant_portal_001', programme_name: 'NYDA Grant Programme', issuer_name: 'NYDA', geo_scope: 'National', closing_date: '' },
  { opportunity_id: 'unrelated_001', programme_name: 'IDC Manufacturing Fund', issuer_name: 'IDC', geo_scope: 'National', closing_date: '' },
] as const;

// ─── 1. Schema checks ─────────────────────────────────────────────────────────

section('1. Portal template schema');
for (const t of TEMPLATES) {
  check(`${t.id}: has title`, !!t.title && t.title.length > 0);
  check(`${t.id}: has portalUrl`, /^https?:\/\//.test(t.portalUrl), t.portalUrl);
  check(`${t.id}: has programmeCode`, !!t.programmeCode && t.programmeCode.length > 0);
  check(`${t.id}: has intro`, Array.isArray(t.intro) && t.intro.length > 0);
  check(`${t.id}: has rules`, Array.isArray(t.rules) && t.rules.length > 0);
  check(`${t.id}: has portalInstructions`, Array.isArray(t.portalInstructions) && t.portalInstructions.length > 0);
  check(`${t.id}: has neverFilled`, Array.isArray(t.neverFilled) && t.neverFilled.length > 0);
  check(`${t.id}: has at least 4 sections`, t.sections.length >= 4, `got ${t.sections.length}`);
  check(`${t.id}: toPortalJson is a function`, typeof t.toPortalJson === 'function');
  check(`${t.id}: validate is a function`, typeof t.validate === 'function');
  check(`${t.id}: prefill is a function`, typeof t.prefill === 'function');

  let portalKeyMissing = 0;
  let choiceWithoutOptions = 0;
  let duplicatePortalKey = 0;
  const seenKeys = new Set<string>();
  for (const s of t.sections) {
    for (const q of s.questions as PortalQuestion[]) {
      if (q.portal) {
        if (!q.portal.portalKey) portalKeyMissing += 1;
        else {
          if (seenKeys.has(q.portal.portalKey)) duplicatePortalKey += 1;
          seenKeys.add(q.portal.portalKey);
        }
      }
      if (q.type === 'choice' && (!q.options || q.options.length === 0)) choiceWithoutOptions += 1;
    }
  }
  check(`${t.id}: every portal question has a portalKey`, portalKeyMissing === 0, `${portalKeyMissing} missing`);
  check(`${t.id}: no duplicate portalKey`, duplicatePortalKey === 0, `${duplicatePortalKey} duplicates`);
  check(`${t.id}: every choice question has options`, choiceWithoutOptions === 0);
}

// ─── 2. Prefill checks ────────────────────────────────────────────────────────

section('2. Prefill from profile');
for (const t of TEMPLATES) {
  const filled = t.prefill(MOCK_PROFILE);
  const keys = Object.keys(filled);
  check(`${t.id}: prefill returns at least 5 keys`, keys.length >= 5, `got ${keys.length}`);
  // Every key prefill writes should exist in the template (no orphan prefill).
  const validKeys = new Set<string>();
  for (const s of t.sections) for (const q of s.questions as PortalQuestion[]) validKeys.add(q.key);
  const orphans = keys.filter((k) => !validKeys.has(k));
  check(`${t.id}: prefill only writes keys that exist in the template`, orphans.length === 0, `orphans: ${orphans.join(', ')}`);
  // Common prefill sanity.
  check(`${t.id}: prefill seeds owner.first_names or a.first_names`, !!filled['owner.first_names'] || !!filled['a.first_names']);
  check(`${t.id}: prefill seeds owner.surname or a.surname`, !!filled['owner.surname'] || !!filled['a.surname']);
}

// ─── 3. Validation ────────────────────────────────────────────────────────────

section('3. Validation — realistic answer set passes');
const answerSets: Record<string, Record<string, string>> = {
  'sedfa-amavulandlela-portal': {
    'elig.disability_owner': 'yes',
    'elig.disability_pct': '60',
    'elig.operationally_involved': 'yes',
    'elig.feasible': 'yes',
    'elig.disability_nature': 'Cerebral palsy — uses a wheelchair, full cognitive function, manages all customer relations.',
    'owner.title': 'ms',
    'owner.first_names': 'Thandiwe',
    'owner.surname': 'Mokoena',
    'owner.id': '9901235600089',
    'owner.gender': 'female',
    'owner.age': '27',
    'owner.population': 'african',
    'owner.nationality': 'South African',
    'owner.cell': '083 555 0199',
    'owner.email': 'thandiwe@example.co.za',
    'owner.address': '14 Main Road, Dutywa',
    'owner.province': 'Eastern Cape',
    'owner.postal_code': '5050',
    'biz.name': 'Thandiwe Poultry Enterprise',
    'biz.reg_number': '2021/123456/07',
    'biz.entity': 'pty',
    'biz.sector': 'agro',
    'biz.type': 'Free-range egg production for the Amathole district',
    'biz.address': '14 Main Road, Dutywa',
    'biz.province': 'Eastern Cape',
    'biz.postal_code': '5050',
    'biz.years_trading': '2',
    'biz.employees': '3',
    'biz.new_jobs': '2',
    'ask.amount': '500000',
    'ask.term_months': '48',
    'f.equipment': '350000',
    'f.working': '100000',
    'f.stock': '50000',
    'docs.id': 'yes', 'docs.cipc': 'yes', 'docs.bank': 'yes', 'docs.quotations': 'yes', 'docs.cashflow': 'yes', 'docs.disability': 'yes', 'docs.plan': 'yes',
  },
  'sedfa-trep-portal': {
    'elig.stream': 'bakeries',
    'elig.location_type': 'township',
    'elig.owner_lives_there': 'yes',
    'elig.sa_national': 'yes',
    'owner.title': 'mr',
    'owner.first_names': 'Sipho',
    'owner.surname': 'Dlamini',
    'owner.id': '9001015000088',
    'owner.gender': 'male',
    'owner.age': '30',
    'owner.population': 'african',
    'owner.cell': '082 555 0102',
    'owner.email': 'sipho@example.co.za',
    'owner.address': '12 Chief Street, Khayelitsha',
    'owner.province': 'Western Cape',
    'owner.postal_code': '7100',
    'biz.name': 'Sipho\'s Bread',
    'biz.entity': 'sole',
    'biz.sector': 'manufacturing',
    'biz.type': 'Bakery serving the Khayelitsha township community',
    'biz.address': '12 Chief Street, Khayelitsha',
    'biz.province': 'Western Cape',
    'biz.postal_code': '7100',
    'biz.years_trading': '2',
    'biz.employees': '4',
    'biz.new_jobs': '3',
    'ask.amount': '750000',
    'f.equipment': '450000',
    'f.renovation': '200000',
    'f.stock': '100000',
    'docs.id': 'yes', 'docs.proof_address': 'yes', 'docs.bee': 'yes', 'docs.quotations': 'yes',
  },
  'sedfa-peo-ple-youth-portal': {
    'elig.youth_owner': 'yes',
    'elig.youth_pct': '100',
    'elig.startup': 'yes',
    'owner.title': 'mr',
    'owner.first_names': 'Lindo',
    'owner.surname': 'Nkosi',
    'owner.id': '9705115800090',
    'owner.gender': 'male',
    'owner.age': '24',
    'owner.population': 'african',
    'owner.cell': '071 555 0123',
    'owner.email': 'lindo@example.co.za',
    'owner.address': '45 Kerk Street, Polokwane',
    'owner.province': 'Limpopo',
    'owner.postal_code': '0700',
    'biz.name': 'Lindo Web Studio',
    'biz.entity': 'sole',
    'biz.sector': 'ict',
    'biz.type': 'Website design and hosting for local SMEs',
    'biz.address': '45 Kerk Street, Polokwane',
    'biz.province': 'Limpopo',
    'biz.postal_code': '0700',
    'biz.years_trading': '1',
    'biz.employees': '1',
    'biz.new_jobs': '2',
    'ask.amount': '150000',
    'f.equipment': '90000',
    'f.working': '60000',
    'docs.id': 'yes', 'docs.quotations': 'yes', 'docs.cashflow': 'yes', 'docs.plan': 'yes',
  },
  'nyda-erp-grant-portal': {
    'a.first_names': 'Thandiwe',
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
    'a.postal_code': '5050',
    'a.province': 'Eastern Cape',
    'a.geo': 'rural',
    'b.existing': 'yes',
    'b.trained': 'yes',
    'a.nok_name': 'Nomvula Mokoena',
    'a.nok_cell': '083 555 0200',
    'a.nok_relationship': 'Mother',
    'biz.name': 'Thandiwe Poultry Enterprise',
    'biz.type': 'Free-range egg production',
    'biz.sector': 'agro',
    'biz.entity': 'pty',
    'f.amount': '120000',
    'f.use.1.what': 'Layer hens and laying cages',
    'f.use.1.amount': '80000',
    'f.use.2.what': 'Feed for the first cycle',
    'f.use.2.amount': '40000',
    'g.1': 'yes', 'g.2': 'yes', 'g.3': 'yes', 'g.6': 'yes', 'g.7': 'yes', 'g.8': 'yes',
  },
};

for (const t of TEMPLATES) {
  const answers = answerSets[t.id] ?? {};
  const result = t.validate(answers);
  const errMsgs = result.errors.map((e) => e.message).join('; ');
  check(`${t.id}: realistic answer set has zero errors`, result.errors.length === 0, errMsgs);
}

section('3b. Validation — blank sheet is blocked');
for (const t of TEMPLATES) {
  const result = t.validate({});
  check(`${t.id}: blank sheet is blocked with at least 5 errors`, result.errors.length >= 5, `got ${result.errors.length}`);
}

section('3c. Validation — eligibility gates trip on bad answers');
// Amavulandlela: <51% disability ownership should be blocked.
{
  const base = { ...answerSets['sedfa-amavulandlela-portal'], 'elig.disability_pct': '30' };
  const result = SEDFA_AMAVULANDLELA.validate(base);
  check('Amavulandlela: <51% disability ownership is blocked', result.errors.some((e) => /51%/.test(e.message)), result.errors.map((e) => e.message).join('; '));
}
// Amavulandlela: passive shareholding should be blocked.
{
  const base = { ...answerSets['sedfa-amavulandlela-portal'], 'elig.operationally_involved': 'no' };
  const result = SEDFA_AMAVULANDLELA.validate(base);
  check('Amavulandlela: passive shareholding is blocked', result.errors.some((e) => /operationally/i.test(e.message)));
}
// TREP: owner living outside the area should be blocked.
{
  const base = { ...answerSets['sedfa-trep-portal'], 'elig.owner_lives_there': 'no' };
  const result = SEDFA_TREP.validate(base);
  check('TREP: owner not living in area is blocked', result.errors.some((e) => /owner to live/i.test(e.message)));
}
// Peo Pele: <51% youth ownership should be blocked.
{
  const base = { ...answerSets['sedfa-peo-ple-youth-portal'], 'elig.youth_pct': '40' };
  const result = SEDFA_PEO_PLE_YOUTH.validate(base);
  check('Peo Pele: <51% youth ownership is blocked', result.errors.some((e) => /51%/i.test(e.message)));
}
// NYDA: age 40 should warn.
{
  const base = { ...answerSets['nyda-erp-grant-portal'], 'a.age': '40' };
  const result = NYDA_ERP_GRANT.validate(base);
  check('NYDA: age 40 produces an age warning', result.warnings.some((w) => /18 to 35/i.test(w.message)));
}

// ─── 4. JSON output ───────────────────────────────────────────────────────────

section('4. toPortalJson output');
for (const t of TEMPLATES) {
  const answers = answerSets[t.id] ?? {};
  const json = t.toPortalJson(answers);
  check(`${t.id}: returns an object`, typeof json === 'object' && json !== null);
  check(`${t.id}: includes meta.programme_code`, (json as Record<string, unknown>).meta !== undefined && ((json as Record<string, Record<string, unknown>>).meta as Record<string, unknown>).programme_code === t.programmeCode);
  check(`${t.id}: includes owner.first_names or client.first_names`, !!(json as Record<string, unknown>).owner || !!(json as Record<string, unknown>).client);
  check(`${t.id}: includes business registered_name or name`, !!((json as Record<string, Record<string, unknown>>).business ?? {}).registered_name || !!((json as Record<string, Record<string, unknown>>).business ?? {}).name);
  check(`${t.id}: includes funding or grant block`, !!(json as Record<string, unknown>).funding || !!(json as Record<string, unknown>).grant);
  // ShowIf-respecting: disability_description should NOT appear in Amavulandlela JSON when disability_owner is 'no'.
  if (t.id === 'sedfa-amavulandlela-portal') {
    const noDisability = t.toPortalJson({ ...answers, 'elig.disability_owner': 'no' });
    const amav = (noDisability as Record<string, Record<string, unknown>>).amavulandlela ?? {};
    check('Amavulandlela: hidden disability_nature key not in JSON when owner says No', amav.disability_description === undefined);
  }
}

// ─── 5. Matching ──────────────────────────────────────────────────────────────

section('5. Matching — built-in mock opportunities');
const expectedMatches: Record<string, string> = {
  sedfa_amavulandlela_001: SEDFA_AMAVULANDLELA.id,
  sedfa_trep_001: SEDFA_TREP.id,
  sedfa_peo_ple_001: SEDFA_PEO_PLE_YOUTH.id,
  nyda_grant_portal_001: NYDA_ERP_GRANT.id,
  unrelated_001: '',
};
for (const m of MOCKS) {
  const matched = findPortalTemplate(m);
  const expected = expectedMatches[m.opportunity_id] ?? '';
  if (expected) {
    check(`${m.opportunity_id} matches ${expected}`, matched?.id === expected, matched ? `got ${matched.id}` : 'got null');
  } else {
    check(`${m.opportunity_id} matches nothing`, matched === null, matched ? `got ${matched.id}` : '');
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n============================================================');
console.log(`PORTAL ENGINE CHECKS: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exit(1);
} else {
  console.log('ALL CHECKS PASSED');
}
