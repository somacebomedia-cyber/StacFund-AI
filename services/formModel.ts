// services/formModel.ts
/**
 * The pure data model for fillable official forms: types, plus the tiny helpers
 * templates and screens need. It deliberately has NO pdf-lib import, so the
 * screens that only need to know which form matches an opportunity (the
 * Explorer) do not pull the PDF library into the main bundle. The engine that
 * actually writes a PDF lives in ./formAutofill.
 */

import type { FundingOpportunityDb } from '../types';

// ─── Types shared by templates, the engine and the wizard ───────────────────

/** Every answer is a string keyed by a template key, e.g. "a.business_name". */
export type AnswerMap = Record<string, string>;

/** Coordinates are PDF points measured from the TOP-LEFT of the page. */
export interface Rect {
  x0: number;
  top: number;
  x1: number;
  bottom: number;
}

export interface Condition {
  key: string;
  equals: string;
}

export type ValueFormat = 'text' | 'money' | 'amount' | 'percent';

export type DrawOp =
  | { kind: 'text'; page: number; key: string; x: number; baseline: number; maxWidth: number; size?: number; minSize?: number; format?: ValueFormat; when?: Condition }
  | { kind: 'wrap'; page: number; key: string; x: number; top: number; width: number; height: number; size?: number; minSize?: number }
  | { kind: 'tick'; page: number; key: string; equals: string; rect: Rect; when?: Condition }
  | { kind: 'circle'; page: number; key: string; equals: string; rect: Rect };

export type QuestionType = 'text' | 'number' | 'textarea' | 'choice' | 'check';

export interface ChoiceOption {
  value: string;
  label: string;
}

export interface Question {
  key: string;
  label: string;
  type: QuestionType;
  required?: boolean;
  options?: ChoiceOption[];
  help?: string;
  placeholder?: string;
  maxLength?: number;
  inputMode?: 'numeric' | 'tel' | 'email' | 'text';
  showIf?: Condition;
}

export interface RowColumn {
  field: string;
  label: string;
  type: 'text' | 'number';
  placeholder?: string;
  maxLength?: number;
}

/** A small table (shareholders, directors, past funding). Rows appear one at a time. */
export interface RowGroup {
  id: string;
  title: string;
  help?: string;
  maxRows: number;
  columns: RowColumn[];
  keyFor: (row: number, field: string) => string;
  showIf?: Condition;
}

export interface FormSection {
  id: string;
  title: string;
  intro?: string;
  questions: Question[];
  rowGroups?: RowGroup[];
}

/** What the app already knows about the applicant (from their own profile). */
export interface ProfileSource {
  email: string;
  businessName: string;
  whatsapp?: string;
  profile?: Record<string, unknown>;
  ownerInfo?: Record<string, unknown>;
  documentCategories?: string[];
}

export interface Issue {
  key?: string;
  message: string;
}

export interface ValidationResult {
  errors: Issue[];
  warnings: Issue[];
}

export interface FormTemplate {
  id: string;
  title: string;
  /** Where the blank official PDF is served from (inside /public). */
  assetPath: string;
  matches: (o: Pick<FundingOpportunityDb, 'programme_name' | 'issuer_name' | 'geo_scope' | 'closing_date'>) => boolean;
  /** Plain-language notes shown before the questions. */
  intro: string[];
  rules: string[];
  /** Things the app deliberately leaves blank. Shown to the applicant. */
  neverFilled: string[];
  sections: FormSection[];
  ops: DrawOp[];
  prefill: (src: ProfileSource) => AnswerMap;
  validate: (answers: AnswerMap) => ValidationResult;
  /** Values worked out from the answers (for example a total). Never typed by the applicant. */
  computed?: (answers: AnswerMap) => AnswerMap;
}

// ─── Portal templates (online applications with no printable PDF) ──────────────
//
// A PortalFormTemplate is the digital twin of an online application portal
// (SEDFA eThuse / SMME Portal, NYDA ERP). It captures the same questions the
// portal asks, lets the applicant answer them in this app with profile prefill
// and rule checks, and produces a JSON object the applicant pastes into the
// portal. There is no PDF to overlay: the portal's own UI is the final form.

/** How one question maps to a field in the portal's JSON. */
export interface PortalField {
  /** The JSON key the portal form expects. */
  portalKey: string;
  /**
   * Transform applied to the answer before it goes into the JSON. Use this when
   * the portal expects an enum code (e.g. "M" instead of "Male"), a number
   * instead of a string, or a value derived from several answers at once.
   */
  portalTransform?: (value: string, allAnswers: AnswerMap) => string | number | boolean | null;
}

/** A question that also knows its place in the portal's JSON payload. */
export interface PortalQuestion extends Question {
  /** When omitted, the answer is not included in the portal JSON (informational only). */
  portal?: PortalField;
}

/** A section whose questions may carry portal mappings. */
export interface PortalFormSection extends Omit<FormSection, 'questions'> {
  questions: PortalQuestion[];
}

export interface PortalFormTemplate {
  id: string;
  title: string;
  /** The portal URL the applicant will paste the JSON output into. */
  portalUrl: string;
  /** Optional SEDFA programme code, NYDA voucher code, etc. Shown to the user. */
  programmeCode?: string;
  matches: (o: Pick<FundingOpportunityDb, 'programme_name' | 'issuer_name' | 'geo_scope' | 'closing_date'>) => boolean;
  intro: string[];
  rules: string[];
  /** Plain-language notes on how to use the JSON output in the portal. */
  portalInstructions: string[];
  /** Things the app deliberately leaves for the applicant to do in the portal themselves. */
  neverFilled: string[];
  sections: PortalFormSection[];
  prefill: (src: ProfileSource) => AnswerMap;
  validate: (answers: AnswerMap) => ValidationResult;
  /** Values worked out from the answers (e.g. a total). Never typed by the applicant. */
  computed?: (answers: AnswerMap) => AnswerMap;
  /**
   * Builds the JSON object the applicant pastes into the portal. The default
   * implementation (in portalFormTemplates/portalShared.ts) walks every section
   * question with a `portal.portalKey` and writes its (possibly transformed)
   * answer at that key. Templates can override this if the portal needs a
   * nested structure the per-question mapping can't express.
   */
  toPortalJson: (answers: AnswerMap) => Record<string, unknown>;
}

/** Type guard — distinguishes the two template kinds at the wizard. */
export function isPortalTemplate(t: FormTemplate | PortalFormTemplate): t is PortalFormTemplate {
  return (t as PortalFormTemplate).portalUrl !== undefined && (t as FormTemplate).assetPath === undefined;
}

export function conditionHolds(cond: Condition | undefined, answers: AnswerMap): boolean {
  return !cond || (answers[cond.key] ?? '') === cond.equals;
}

// ─── Small answer helpers used by templates and the wizard ───────────────────

export function visibleQuestions(section: FormSection, answers: AnswerMap): Question[] {
  return section.questions.filter((q) => conditionHolds(q.showIf, answers));
}

export function isBlank(v: string | undefined): boolean {
  return !v || !v.trim();
}

/**
 * Drops a trailing decimal part ("350000.50" or "350000,50" -> "350000") so
 * cents are never read as extra rand digits. Without this, a pasted amount
 * with cents becomes 100x bigger after digit-stripping.
 */
export function stripTrailingCents(v: string | undefined): string {
  return (v ?? '').replace(/[.,]\d{1,2}$/, '');
}

export function toInt(v: string | undefined): number {
  const digits = stripTrailingCents(v).replace(/\D/g, '').slice(0, 15); // past 15 digits, number precision is lost anyway
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

/** key -> plain-language label for every question and table cell in a template. */
export function labelMap(template: FormTemplate): Record<string, string> {
  const map: Record<string, string> = {};
  for (const section of template.sections) {
    for (const question of section.questions) map[question.key] = question.label;
    for (const group of section.rowGroups ?? []) {
      for (let row = 1; row <= group.maxRows; row++) {
        for (const column of group.columns) map[group.keyFor(row, column.field)] = `${group.title}, row ${row}: ${column.label}`;
      }
    }
  }
  return map;
}

