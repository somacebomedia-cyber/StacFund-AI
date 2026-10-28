// services/portalFormTemplates/portalShared.ts
/**
 * Helpers shared by every PortalFormTemplate: the default `toPortalJson` walker,
 * common option lists, and prefill / validation helpers that mirror the
 * patterns in services/formTemplates/kznYouthFund2026.ts but are tuned for the
 * SEDFA / NYDA online portals.
 *
 * The portals themselves are behind login walls, so these templates capture the
 * questions the portals are publicly documented to ask (programme eligibility,
 * business identity, owner identity, funding ask, jobs, supporting documents).
 * The portal JSON keys are the ones the wizard writes; the applicant pastes
 * them into the portal's own form, which keeps the user in control.
 */

import { conditionHolds, isBlank, toInt } from '../formModel';
import type {
  AnswerMap,
  PortalFormTemplate,
  PortalQuestion,
  PortalFormSection,
  ProfileSource,
  Question,
  Issue,
} from '../formModel';

// ─── Common option lists ─────────────────────────────────────────────────────

export const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

export const POPULATION_GROUPS = [
  { value: 'african', label: 'African' },
  { value: 'white', label: 'White' },
  { value: 'indian', label: 'Indian' },
  { value: 'coloured', label: 'Coloured' },
];

export const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/**
 * The SEDFA / NYDA sectors. Each portal exposes its own subset; templates that
 * need a narrower list define it locally. The codes are stable so the JSON the
 * wizard emits is identical for the same answer every time.
 */
export const SECTORS: { value: string; label: string; portalCode: string }[] = [
  { value: 'agro', label: 'Agro-processing / Agriculture', portalCode: 'AGRO' },
  { value: 'construction', label: 'Construction', portalCode: 'CONSTR' },
  { value: 'manufacturing', label: 'Manufacturing', portalCode: 'MANUF' },
  { value: 'retail', label: 'Retail', portalCode: 'RETAIL' },
  { value: 'service', label: 'Services', portalCode: 'SERV' },
  { value: 'ict', label: 'Information & Communication Technology', portalCode: 'ICT' },
  { value: 'tourism', label: 'Tourism & Hospitality', portalCode: 'TOUR' },
  { value: 'transport', label: 'Transport & Logistics', portalCode: 'TRANSP' },
  { value: 'mining', label: 'Mining & Minerals', portalCode: 'MINING' },
  { value: 'green', label: 'Green Economy', portalCode: 'GREEN' },
  { value: 'other', label: 'Other (specify)', portalCode: 'OTHER' },
];

export const LEGAL_ENTITIES = [
  { value: 'sole', label: 'Sole Proprietor', portalCode: 'SOLE' },
  { value: 'cc', label: 'Close Corporation', portalCode: 'CC' },
  { value: 'pty', label: 'Private Company (Pty) Ltd', portalCode: 'PTY' },
  { value: 'coops', label: 'Co-operative', portalCode: 'COOP' },
  { value: 'partnership', label: 'Partnership', portalCode: 'PART' },
  { value: 'trust', label: 'Trust', portalCode: 'TRUST' },
  { value: 'other', label: 'Other (specify)', portalCode: 'OTHER' },
];

export const SA_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const str = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
export const digitsOnly = (v: string): string => v.replace(/\D/g, '');

/** Sector guesser used by every portal template's prefill. */
export function guessSector(industry: string): string {
  const i = industry.toLowerCase();
  const rules: [RegExp, string][] = [
    [/aquacult|fish farm|fishery|poultry|piggery|livestock|agri|farm|crop|vegetable|fruit|citrus|grain|wool|nuts|food process|juice|packhouse|abattoir/, 'agro'],
    [/construct|building|contractor|renovat/, 'construction'],
    [/manufactur|factory|fabricat|production|sewing|clothing|furniture|metal work|welding/, 'manufacturing'],
    [/retail|shop|spaza|store|trading|wholesale|butchery|baker|confection/, 'retail'],
    [/touris|hospitality|hotel|lodge|guest ?house|bnb|restaurant|catering|travel|tshisanyama|cooked food/, 'tourism'],
    [/software|digital|ict|information|technolog|computer|internet|app\b|web/, 'ict'],
    [/transport|logistic|taxi|trucking|courier/, 'transport'],
    [/mining|mineral|quarry/, 'mining'],
    [/green|solar|renewable|recycl|waste|environment/, 'green'],
    [/hair|salon|cleaning|repair|mechanic|plumb|electr|personal care|beauty/, 'service'],
  ];
  for (const [re, value] of rules) if (re.test(i)) return value;
  return '';
}

/** A suggestion only: the applicant confirms or changes it in the wizard. */
export function prefillBusinessAndOwner(src: ProfileSource): AnswerMap {
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
  set('owner.surname', surname);
  set('owner.first_names', firstNames);
  set('owner.id', id);
  set('owner.age', digitsOnly(str(o.age)));
  set('owner.email', src.email);
  set('owner.cell', str(p.whatsapp) || str(src.whatsapp));
  set('owner.gender', str(o.gender).toLowerCase());
  set('biz.name', str(p.name) || src.businessName);
  set('biz.trading_name', str(p.tradingName));
  set('biz.type', str(p.description).slice(0, 80));
  set('biz.sector', guessSector(str(p.industry)));
  set('biz.reg_number', str(p.registration));
  set('biz.address', str(p.address) || str(o.address));
  set('biz.province', str(p.province));
  set('biz.postal_code', digitsOnly(str(p.postalCode)).slice(0, 4));
  return a;
}

/**
 * Variant for templates whose owner questions use the `a.*` namespace (NYDA's
 * Grant Programme). Maps the same profile data into a.* keys instead of
 * owner.* keys.
 */
export function prefillClientA(src: ProfileSource): AnswerMap {
  const p = src.profile ?? {};
  const o = src.ownerInfo ?? {};
  const a: AnswerMap = {};
  const set = (key: string, value: string) => {
    if (value) a[key] = value;
  };
  const fullName = str(o.name);
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstNames = parts.slice(0, -1).join(' ');
  const surname = parts.length > 1 ? parts[parts.length - 1] : '';
  const id = digitsOnly(str(o.idNumber));
  set('a.first_names', firstNames);
  set('a.surname', surname);
  set('a.id', id);
  set('a.age', digitsOnly(str(o.age)));
  set('a.email', src.email);
  set('a.cell', str(p.whatsapp) || str(src.whatsapp));
  set('a.address', str(p.address) || str(o.address));
  set('a.postal_code', digitsOnly(str(p.postalCode)).slice(0, 4));
  set('a.province', str(p.province));
  set('biz.name', str(p.name) || src.businessName);
  set('biz.type', str(p.description).slice(0, 80));
  set('biz.sector', guessSector(str(p.industry)));
  return a;
}

// ─── Default JSON builder ─────────────────────────────────────────────────────

/**
 * The default `toPortalJson` used by every template that doesn't override it.
 * Walks every visible question in section order and writes the (possibly
 * transformed) answer at its `portal.portalKey`. Empty answers are skipped so
 * the JSON the user pastes stays clean.
 */
export function defaultPortalJson(template: PortalFormTemplate, answers: AnswerMap): Record<string, unknown> {
  const data: AnswerMap = { ...answers, ...(template.computed ? template.computed(answers) : {}) };
  const out: Record<string, unknown> = {};
  for (const section of template.sections) {
    for (const question of section.questions as PortalQuestion[]) {
      if (!conditionHolds(question.showIf, data)) continue;
      const portal = question.portal;
      if (!portal) continue;
      const raw = data[question.key] ?? '';
      if (isBlank(raw)) continue;
      let value: string | number | boolean | null = raw;
      if (portal.portalTransform) {
        const transformed = portal.portalTransform(raw, data);
        if (transformed === null || transformed === undefined || transformed === '') continue;
        value = transformed;
      }
      // Dot-delimited keys become nested objects (e.g. "owner.contact.cell").
      setByKey(out, portal.portalKey, value);
    }
  }
  return out;
}

/** Writes a value at a dotted key path, creating intermediate objects. */
function setByKey(target: Record<string, unknown>, dottedKey: string, value: unknown): void {
  const parts = dottedKey.split('.');
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const existing = cursor[part];
    if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

// ─── Validation helpers ──────────────────────────────────────────────────────

export interface ValidationCtx {
  answers: AnswerMap;
  errors: Issue[];
  warnings: Issue[];
  /** Map of question.key -> label, for human messages. */
  labels: Record<string, string>;
}

export const err = (ctx: ValidationCtx, key: string, message: string): void => {
  ctx.errors.push({ key, message });
};
export const warn = (ctx: ValidationCtx, message: string, key?: string): void => {
  ctx.warnings.push({ key, message });
};

/** Required-fields check that respects showIf conditions. */
export function checkRequired(ctx: ValidationCtx, sections: PortalFormSection[]): void {
  for (const s of sections) {
    for (const q of s.questions) {
      if (!q.required) continue;
      if (!conditionHolds(q.showIf, ctx.answers)) continue;
      if (isBlank(ctx.answers[q.key])) {
        const label = ctx.labels[q.key] ?? q.key;
        err(ctx, q.key, `Add: ${label}`);
      }
    }
  }
}

/** SA ID sanity warning. */
export function warnId(ctx: ValidationCtx, key: string): void {
  const id = digitsOnly(ctx.answers[key] ?? '');
  if (id && id.length !== 13) warn(ctx, 'A South African ID number has 13 digits.', key);
}

/** Age range sanity warning. */
export function warnAgeRange(ctx: ValidationCtx, key: string, min: number, max: number, label: string): void {
  const age = toInt(ctx.answers[key]);
  if (age > 0 && (age < min || age > max)) warn(ctx, `${label} is for people aged ${min} to ${max}.`, key);
}

/** Whole-rand sanity: warns if amount is outside the band. */
export function warnAmountBand(ctx: ValidationCtx, key: string, min: number, max: number, label: string): void {
  if (min > 0 || max > 0) {
    const amount = toInt(ctx.answers[key]);
    if (amount > 0 && (amount < min || amount > max)) {
      warn(ctx, `${label} runs from R${min.toLocaleString('en-ZA')} to R${max.toLocaleString('en-ZA').replace(/\u00A0/g, ' ')}. Confirm your amount with the portal.`, key);
    }
  }
}

/** Sums a set of "funding line" answer keys. */
export function sumLines(answers: AnswerMap, keys: string[]): number {
  return keys.reduce((sum, k) => sum + toInt(answers[k]), 0);
}

/** Question-builder shortcut, mirrors the one in the PDF templates. */
export const q = (key: string, label: string, type: Question['type'], extra: Partial<PortalQuestion> = {}): PortalQuestion => ({
  key,
  label,
  type,
  ...extra,
});

/** Builds the human label map for a template's questions. */
export function labelMapFor(sections: PortalFormSection[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of sections) for (const question of s.questions) map[question.key] = question.label;
  return map;
}

// ─── Lookup: portal code for a sector / entity choice ─────────────────────────

export function sectorCode(value: string): string {
  return SECTORS.find((s) => s.value === value)?.portalCode ?? 'OTHER';
}
export function entityCode(value: string): string {
  return LEGAL_ENTITIES.find((e) => e.value === value)?.portalCode ?? 'OTHER';
}
