// services/opportunityIntake.ts
/**
 * StacFund — Opportunity intake (SERVER ONLY)
 * ===========================================
 * Turns a poster, PDF, page text or pasted message into a structured funding
 * opportunity, parks it in a review queue, and only publishes it to the public
 * directory after a human has checked it.
 *
 *   document ──► extractOpportunities()   Gemini reads the REAL bytes/text
 *            ──► normalizeExtracted()     strict cleaning, nothing is guessed
 *            ──► createDraft()            funding_opportunity_drafts (private)
 *            ──► publishDraft()           funding_opportunities (public)
 *
 * Rules this file enforces:
 *   - The model may only copy what the document says. Unknown = null.
 *   - Nothing AI-extracted is public until publishDraft() runs (admin only).
 *   - Publishing needs a way for applicants to verify the opportunity.
 *
 * Do NOT import this file from browser code (it uses Node + the Admin SDK).
 * Shared types live in ../types.
 */

import { GoogleGenAI, Type } from '@google/genai';
import type { Part, Schema } from '@google/genai';
import type { Firestore } from 'firebase-admin/firestore';
import { FundingType } from '../types';
import type {
  ApplicationChannel,
  DraftRecord,
  DraftWithId,
  EligibilityRules,
  ExtractedOpportunity,
  FundingOpportunityDb,
  FundingThreshold,
  OpportunitySourceType,
} from '../types';
import { computeStatus } from './opportunityStatus';
import { notifyMatchingUsers } from './userAlerts';

// ─── Constants ───────────────────────────────────────────────────────────────

export const COLLECTIONS = {
  PUBLISHED: 'funding_opportunities',
  DRAFTS: 'funding_opportunity_drafts',
  SCRAPER_RUNS: 'scraper_runs',
} as const;

/** Same default model the rest of the app uses; override with GEMINI_EXTRACTION_MODEL. */
export const EXTRACTION_MODEL = process.env.GEMINI_EXTRACTION_MODEL || 'gemini-3.8-flash';

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB after base64 decoding
export const MAX_TEXT_CHARS = 30000;

const FUNDING_TYPES: string[] = Object.values(FundingType);
const CHANNELS: ApplicationChannel[] = ['ONLINE', 'IN_PERSON', 'EMAIL', 'POST', 'MIXED'];

export class IntakeError extends Error {
  public readonly status: number;
  public readonly details: string[];
  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.name = 'IntakeError';
    this.status = status;
    this.details = details;
  }
}

// ─── Cleaning helpers (the model's output is never trusted as-is) ────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: unknown, max = 800): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

function num(v: unknown, max = 1e12): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n);
}

function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function list(v: unknown, maxItems = 30, maxLen = 300): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of v) {
    const s = str(item, maxLen);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function isoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!ISO_DATE.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t ? t : null;
}

function httpUrl(v: unknown): string | null {
  const s = str(v, 500);
  return s && /^https?:\/\/\S+$/i.test(s) ? s : null;
}

function emailAddr(v: unknown): string | null {
  const s = str(v, 200);
  return s && EMAIL_RE.test(s) ? s.toLowerCase() : null;
}

function fundingType(v: unknown): string | null {
  const s = str(v, 40);
  if (!s) return null;
  const upper = s.toUpperCase();
  return FUNDING_TYPES.includes(upper) ? upper : null;
}

function channel(v: unknown): ApplicationChannel | null {
  const s = str(v, 20);
  if (!s) return null;
  const upper = s.toUpperCase().replace(/\s+/g, '_');
  return (CHANNELS as string[]).includes(upper) ? (upper as ApplicationChannel) : null;
}

function cleanThresholds(v: unknown): FundingThreshold[] {
  if (!Array.isArray(v)) return [];
  const out: FundingThreshold[] = [];
  for (const t of v.slice(0, 10)) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    const name = str(o.name, 120);
    if (!name) continue;
    out.push({
      name,
      amount_min: num(o.amount_min),
      amount_max: num(o.amount_max),
      min_jobs: num(o.min_jobs, 100000),
      requirements: list(o.requirements, 20, 200),
    });
  }
  return out;
}

/** Turns whatever the model (or an admin's edit form) sent into a safe, fully-typed record. */
export function normalizeExtracted(raw: unknown): ExtractedOpportunity {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const thresholds = cleanThresholds(o.thresholds);
  const notes = list(o.extraction_notes, 20, 400);

  let amountMin = num(o.amount_min);
  let amountMax = num(o.amount_max);
  if (thresholds.length) {
    const mins = thresholds.map((t) => t.amount_min).filter((n): n is number => n !== null);
    const maxs = thresholds.map((t) => t.amount_max).filter((n): n is number => n !== null);
    if (amountMin === null && mins.length) amountMin = Math.min(...mins);
    if (amountMax === null && maxs.length) amountMax = Math.max(...maxs);
  }
  if (amountMin !== null && amountMax !== null && amountMin > amountMax) {
    notes.push(`Amounts look reversed (min ${amountMin} is higher than max ${amountMax}). Please check.`);
  }

  const closing = isoDate(o.closing_date);
  if (typeof o.closing_date === 'string' && o.closing_date.trim() && !closing) {
    notes.push(`Closing date "${o.closing_date.trim()}" is not a valid YYYY-MM-DD date and was cleared. Please enter it.`);
  }
  const opening = isoDate(o.opening_date);
  if (typeof o.opening_date === 'string' && o.opening_date.trim() && !opening) {
    notes.push(`Opening date "${o.opening_date.trim()}" is not a valid YYYY-MM-DD date and was cleared.`);
  }
  if (opening && closing && opening > closing) {
    notes.push('The opening date is after the closing date. Please check both.');
  }

  const ageMin = num(o.age_min, 120);
  const ageMax = num(o.age_max, 120);

  return {
    programme_name: str(o.programme_name, 200),
    issuer_name: str(o.issuer_name, 200),
    issuer_type: str(o.issuer_type, 80),
    funding_type: fundingType(o.funding_type),
    cycle_label: str(o.cycle_label, 120),
    opening_date: opening,
    closing_date: closing,
    closing_date_text: str(o.closing_date_text, 200),
    is_rolling: bool(o.is_rolling),
    geo_scope: str(o.geo_scope, 200),
    sector_tags: list(o.sector_tags, 30, 80),
    sectors_excluded: list(o.sectors_excluded, 30, 120),
    age_min: ageMin,
    age_max: ageMax,
    youth_ownership_min_pct: num(o.youth_ownership_min_pct, 100),
    amount_min: amountMin,
    amount_max: amountMax,
    thresholds,
    eligibility_summary: str(o.eligibility_summary, 1200),
    required_documents: list(o.required_documents, 30, 200),
    how_to_apply: str(o.how_to_apply, 800),
    application_channel: channel(o.application_channel),
    emailed_applications_accepted: bool(o.emailed_applications_accepted),
    application_url: httpUrl(o.application_url),
    form_url: httpUrl(o.form_url),
    contact_email: emailAddr(o.contact_email),
    contact_phone: str(o.contact_phone, 120),
    evidence: list(o.evidence, 8, 300),
    risk_flags: list(o.risk_flags, 8, 200),
    extraction_notes: notes,
  };
}

// ─── Keys & IDs ──────────────────────────────────────────────────────────────

function slug(s: string | null | undefined, max: number): string {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

/**
 * Same issuer + same programme + same intake year => same key. This only
 * detects obvious repeats; two documents about one fund with different wording
 * are joined explicitly by the admin ("add another document to this record").
 */
export function buildDedupeKey(
  e: Pick<ExtractedOpportunity, 'issuer_name' | 'programme_name' | 'closing_date' | 'cycle_label'>
): string {
  const cycle = e.closing_date ? e.closing_date.slice(0, 4) : slug(e.cycle_label, 20) || 'na';
  return [slug(e.issuer_name, 40) || 'unknown-issuer', slug(e.programme_name, 60) || 'unknown-programme', cycle].join('__');
}

export function opportunityIdFromKey(key: string): string {
  return `opp_${key}`.slice(0, 150);
}

// ─── Merging two documents about the same opportunity ────────────────────────

const SCALAR_KEYS = [
  'programme_name', 'issuer_name', 'issuer_type', 'funding_type', 'cycle_label', 'opening_date', 'closing_date',
  'closing_date_text', 'is_rolling', 'geo_scope', 'age_min', 'age_max', 'youth_ownership_min_pct', 'amount_min',
  'amount_max', 'eligibility_summary', 'how_to_apply', 'application_channel', 'emailed_applications_accepted',
  'application_url', 'form_url', 'contact_email', 'contact_phone',
] as const;

const LIST_KEYS = ['sector_tags', 'sectors_excluded', 'required_documents', 'evidence', 'risk_flags'] as const;

/** Fills gaps from `incoming`; never overwrites a value; records conflicts as notes for the reviewer. */
export function mergeExtracted(base: ExtractedOpportunity, incoming: ExtractedOpportunity): ExtractedOpportunity {
  const merged: ExtractedOpportunity = { ...base };
  const target = merged as unknown as Record<string, unknown>;
  const notes = [...base.extraction_notes];

  for (const k of SCALAR_KEYS) {
    const a = base[k];
    const b = incoming[k];
    if (a === null && b !== null) {
      target[k] = b;
    } else if (a !== null && b !== null && a !== b) {
      notes.push(`Another document says ${k} = "${String(b)}"; kept "${String(a)}".`);
    }
  }
  for (const k of LIST_KEYS) {
    target[k] = list([...base[k], ...incoming[k]], 30, 300);
  }

  const byName = new Map<string, FundingThreshold>();
  for (const t of base.thresholds) byName.set(t.name.toLowerCase(), { ...t, requirements: [...t.requirements] });
  for (const t of incoming.thresholds) {
    const existing = byName.get(t.name.toLowerCase());
    if (!existing) {
      byName.set(t.name.toLowerCase(), { ...t, requirements: [...t.requirements] });
    } else {
      existing.amount_min = existing.amount_min ?? t.amount_min;
      existing.amount_max = existing.amount_max ?? t.amount_max;
      existing.min_jobs = existing.min_jobs ?? t.min_jobs;
      existing.requirements = list([...existing.requirements, ...t.requirements], 20, 200);
    }
  }
  merged.thresholds = Array.from(byName.values());
  merged.extraction_notes = list([...notes, ...incoming.extraction_notes], 20, 400);
  return merged;
}

// ─── Gemini extraction ───────────────────────────────────────────────────────

export type IntakeInput =
  | { kind: 'file'; mimeType: string; dataBase64: string }
  | { kind: 'text'; text: string };

/** Sends parts to the model and returns its raw JSON text. Injectable so tests never call the network. */
export type GenerateFn = (parts: Part[]) => Promise<string>;

const nullableString: Schema = { type: Type.STRING, nullable: true };
const nullableNumber: Schema = { type: Type.NUMBER, nullable: true };
const nullableBoolean: Schema = { type: Type.BOOLEAN, nullable: true };
const stringList: Schema = { type: Type.ARRAY, items: { type: Type.STRING } };

const OPPORTUNITY_PROPERTIES: Record<keyof ExtractedOpportunity, Schema> = {
  programme_name: nullableString,
  issuer_name: nullableString,
  issuer_type: nullableString,
  funding_type: nullableString,
  cycle_label: nullableString,
  opening_date: nullableString,
  closing_date: nullableString,
  closing_date_text: nullableString,
  is_rolling: nullableBoolean,
  geo_scope: nullableString,
  sector_tags: stringList,
  sectors_excluded: stringList,
  age_min: nullableNumber,
  age_max: nullableNumber,
  youth_ownership_min_pct: nullableNumber,
  amount_min: nullableNumber,
  amount_max: nullableNumber,
  thresholds: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        amount_min: nullableNumber,
        amount_max: nullableNumber,
        min_jobs: nullableNumber,
        requirements: stringList,
      },
      required: ['name', 'amount_min', 'amount_max', 'min_jobs', 'requirements'],
    },
  },
  eligibility_summary: nullableString,
  required_documents: stringList,
  how_to_apply: nullableString,
  application_channel: nullableString,
  emailed_applications_accepted: nullableBoolean,
  application_url: nullableString,
  form_url: nullableString,
  contact_email: nullableString,
  contact_phone: nullableString,
  evidence: stringList,
  risk_flags: stringList,
  extraction_notes: stringList,
};

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    opportunities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: OPPORTUNITY_PROPERTIES,
        required: Object.keys(OPPORTUNITY_PROPERTIES),
      },
    },
  },
  required: ['opportunities'],
};

const EXTRACTION_PROMPT = `You are a careful data-entry clerk for a South African funding directory.
Read the attached document (a poster, PDF form, web page text or forwarded message) and extract every distinct funding opportunity it announces.

STRICT RULES
1. Use ONLY what is written in the document. If something is not stated, return null (or an empty list). Never guess, never use outside knowledge, never fill gaps.
2. Dates in South Africa are day-month-year. Return a date as YYYY-MM-DD only when day, month and year are all explicit in the document; otherwise return null and copy the wording into closing_date_text. If the wording has typos (for example "05st of O5th October"), still extract the date if it is clear, and mention the typo in extraction_notes.
3. Amounts are South African Rand. Return plain integers (R100,000 becomes 100000, R2 million becomes 2000000).
4. If the document lists several funding tiers or thresholds, put each one in "thresholds" with its own range, its minimum jobs to be created, and the requirements written for that tier.
5. "sector_tags" are the sectors the fund supports. "sectors_excluded" are sectors or activities the document says it will NOT fund.
6. "required_documents" are documents the applicant must submit, exactly as listed.
7. "application_channel" is one of ONLINE, IN_PERSON, EMAIL, POST, MIXED, based only on how the document says to submit. Set "emailed_applications_accepted" to false only if the document says emailed applications are not accepted.
8. "funding_type" is one of GRANT, LOAN, EQUITY, HYBRID, COMPETITION, only if the document makes it clear.
9. "evidence": up to 6 short VERBATIM quotes from the document that support the programme name, the dates and the amounts.
10. "risk_flags": include ONLY these, and only when literally true of the document: "asks applicant to pay a fee", "contact is a free email address (gmail, yahoo, hotmail) but claims to be a government body", "no issuer named", "promises guaranteed approval". Otherwise return an empty list.
11. "extraction_notes": contradictions, typos, unreadable or cut-off parts, or anything a human should double-check.
12. If the document is not a funding opportunity (a job advert, a tender, a news story, unrelated content), return an empty "opportunities" list.`;

function assertInput(input: IntakeInput): void {
  if (input.kind === 'file') {
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
      throw new IntakeError(400, `Unsupported file type "${input.mimeType}". Use a JPG, PNG, WebP or PDF.`);
    }
    if (!/^[A-Za-z0-9+/=\s]+$/.test(input.dataBase64.slice(0, 2000))) {
      throw new IntakeError(400, 'The file data is not valid base64.');
    }
    if (Buffer.byteLength(input.dataBase64, 'base64') > MAX_FILE_BYTES) {
      throw new IntakeError(413, 'That file is too large. Please keep it under 10 MB.');
    }
  } else if (!input.text.trim()) {
    throw new IntakeError(400, 'There is no text to read.');
  }
}

let cachedClient: GoogleGenAI | null = null;

const defaultGenerate: GenerateFn = async (parts) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new IntakeError(503, 'GEMINI_API_KEY is not configured on the server.');
  cachedClient ??= new GoogleGenAI({ apiKey });
  try {
    const res = await cachedClient.models.generateContent({
      model: EXTRACTION_MODEL,
      contents: [{ role: 'user', parts }],
      config: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0 },
    });
    return res.text ?? '';
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new IntakeError(502, 'The AI service could not read this document.', [detail.slice(0, 300)]);
  }
};

/** Reads the document and returns zero or more cleaned opportunities. Only items with a programme name are kept. */
export async function extractOpportunities(
  input: IntakeInput,
  generate: GenerateFn = defaultGenerate
): Promise<ExtractedOpportunity[]> {
  assertInput(input);
  const parts: Part[] =
    input.kind === 'file'
      ? [{ inlineData: { mimeType: input.mimeType, data: input.dataBase64 } }, { text: EXTRACTION_PROMPT }]
      : [{ text: `${EXTRACTION_PROMPT}\n\nDOCUMENT TEXT:\n${input.text.slice(0, MAX_TEXT_CHARS)}` }];

  const raw = await generate(parts);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || '{}');
  } catch {
    throw new IntakeError(502, 'The AI returned an unreadable answer. Try again, or use a clearer image.');
  }
  const items = parsed && typeof parsed === 'object' ? (parsed as { opportunities?: unknown }).opportunities : [];
  if (!Array.isArray(items)) return [];
  return items.map(normalizeExtracted).filter((e) => e.programme_name !== null);
}

// ─── Draft queue ─────────────────────────────────────────────────────────────

export type DraftOrigin = 'manual' | 'scraper';

export interface CreateDraftInput {
  extracted: ExtractedOpportunity;
  sourceType: OpportunitySourceType;
  sourceName: string | null;
  sourceUrl: string | null;
  submittedBy: string;
  origin: DraftOrigin;
}

export type DraftOutcome =
  | { outcome: 'created'; id: string; duplicateOf: string | null }
  | { outcome: 'merged'; id: string }
  | { outcome: 'skipped'; id: string | null; reason: string };

function withId(id: string, data: FirebaseFirestore.DocumentData): DraftWithId {
  return { id, ...(data as DraftRecord) };
}

export async function getDraft(db: Firestore, id: string): Promise<DraftWithId> {
  const snap = await db.collection(COLLECTIONS.DRAFTS).doc(id).get();
  if (!snap.exists) throw new IntakeError(404, 'That draft no longer exists.');
  return withId(snap.id, snap.data() ?? {});
}

export async function listDrafts(db: Firestore, status: DraftRecord['review_status'], limit = 50): Promise<DraftWithId[]> {
  // One equality filter only: needs no composite index. Sorted in memory.
  const snap = await db.collection(COLLECTIONS.DRAFTS).where('review_status', '==', status).limit(Math.min(limit, 100)).get();
  return snap.docs
    .map((d) => withId(d.id, d.data()))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function createDraft(db: Firestore, input: CreateDraftInput): Promise<DraftOutcome> {
  const key = buildDedupeKey(input.extracted);
  const now = new Date().toISOString();
  const publishedId = opportunityIdFromKey(key);

  const [draftSnap, publishedSnap] = await Promise.all([
    db.collection(COLLECTIONS.DRAFTS).where('dedupe_key', '==', key).get(),
    db.collection(COLLECTIONS.PUBLISHED).doc(publishedId).get(),
  ]);
  const sameKey = draftSnap.docs.map((d) => withId(d.id, d.data()));
  const pending = sameKey.find((d) => d.review_status === 'pending');

  if (pending) {
    if (input.origin === 'scraper') {
      return { outcome: 'skipped', id: pending.id, reason: 'already waiting for review' };
    }
    const merged = mergeExtracted(pending.extracted, input.extracted);
    await db.collection(COLLECTIONS.DRAFTS).doc(pending.id).update({ extracted: merged, updated_at: now });
    return { outcome: 'merged', id: pending.id };
  }

  if (input.origin === 'scraper' && sameKey.some((d) => d.review_status === 'rejected')) {
    return { outcome: 'skipped', id: null, reason: 'previously rejected by an admin' };
  }

  const published = publishedSnap.exists ? (publishedSnap.data() as FundingOpportunityDb) : null;
  let changeNote: string | null = null;
  if (published) {
    const newClosing = input.extracted.closing_date ?? (input.extracted.is_rolling ? 'Rolling' : null);
    if (input.origin === 'scraper' && (newClosing === null || newClosing === published.closing_date)) {
      return { outcome: 'skipped', id: null, reason: 'already published, nothing changed' };
    }
    changeNote = `Already published with closing date "${published.closing_date}". This document says "${newClosing ?? 'not stated'}".`;
  }

  const record: DraftRecord = {
    review_status: 'pending',
    dedupe_key: key,
    source_type: input.sourceType,
    source_name: input.sourceName,
    source_url: input.sourceUrl,
    submitted_by: input.submittedBy,
    created_at: now,
    updated_at: now,
    extracted: input.extracted,
    possible_duplicate_of: published ? publishedSnap.id : null,
    change_note: changeNote,
    published_id: null,
    published_at: null,
    reviewed_by: null,
    rejected_reason: null,
  };
  const ref = await db.collection(COLLECTIONS.DRAFTS).add(record);
  return { outcome: 'created', id: ref.id, duplicateOf: record.possible_duplicate_of };
}

/** Adds a second document (for example the application form) to a record that is still being reviewed. */
export async function mergeIntoDraft(db: Firestore, draftId: string, incoming: ExtractedOpportunity): Promise<DraftWithId> {
  const draft = await getDraft(db, draftId);
  if (draft.review_status !== 'pending') throw new IntakeError(409, 'Only drafts that are still pending can be extended.');
  const merged = mergeExtracted(draft.extracted, incoming);
  await db.collection(COLLECTIONS.DRAFTS).doc(draftId).update({ extracted: merged, updated_at: new Date().toISOString() });
  return { ...draft, extracted: merged };
}

export async function updateDraft(db: Firestore, draftId: string, edited: unknown): Promise<DraftWithId> {
  const draft = await getDraft(db, draftId);
  if (draft.review_status !== 'pending') throw new IntakeError(409, 'Only pending drafts can be edited.');
  const extracted = normalizeExtracted(edited);
  const updated_at = new Date().toISOString();
  await db.collection(COLLECTIONS.DRAFTS).doc(draftId).update({ extracted, dedupe_key: buildDedupeKey(extracted), updated_at });
  return { ...draft, extracted, dedupe_key: buildDedupeKey(extracted), updated_at };
}

export async function rejectDraft(db: Firestore, draftId: string, reviewer: string, reason: string | null): Promise<void> {
  const draft = await getDraft(db, draftId);
  if (draft.review_status !== 'pending') throw new IntakeError(409, 'Only pending drafts can be rejected.');
  await db.collection(COLLECTIONS.DRAFTS).doc(draftId).update({
    review_status: 'rejected',
    reviewed_by: reviewer,
    rejected_reason: reason ? reason.slice(0, 300) : null,
    updated_at: new Date().toISOString(),
  });
}

// ─── Publishing ──────────────────────────────────────────────────────────────

/** What must be true before something goes into the public directory. */
export function publishProblems(e: ExtractedOpportunity): string[] {
  const problems: string[] = [];
  if (!e.programme_name) problems.push('Add the programme name.');
  if (!e.issuer_name) problems.push('Add who is offering the funding.');
  if (!e.funding_type) problems.push('Choose the funding type (grant, loan, equity, hybrid or competition).');
  if (!e.closing_date && !e.is_rolling) problems.push('Add a closing date (YYYY-MM-DD), or tick "Open all year" if it has none.');
  if (!e.application_url && !e.contact_email && !e.contact_phone && !e.how_to_apply) {
    problems.push('Add at least one way for applicants to apply or verify it: application link, email, phone, or how-to-apply text.');
  }
  return problems;
}

export interface PublishContext {
  extracted: ExtractedOpportunity;
  officialSource: boolean;
  sourceType: OpportunitySourceType;
  sourceUrl: string | null;
  now?: Date;
}

/** Maps a reviewed extraction onto the public FundingOpportunityDb shape. Omits empty optional fields (Firestore rejects undefined). */
export function toPublishedRecord(ctx: PublishContext): FundingOpportunityDb {
  const e = ctx.extracted;
  const now = ctx.now ?? new Date();
  const key = buildDedupeKey(e);
  const closing = e.closing_date ?? (e.is_rolling ? 'Rolling' : 'Unknown');
  const rules: EligibilityRules = {
    age_min: e.age_min,
    age_max: e.age_max,
    youth_ownership_min_pct: e.youth_ownership_min_pct,
    sectors_excluded: e.sectors_excluded,
  };
  const hasRules = rules.age_min !== null || rules.age_max !== null || rules.youth_ownership_min_pct !== null || rules.sectors_excluded.length > 0;
  const day = now.toISOString().slice(0, 10);

  return {
    opportunity_id: opportunityIdFromKey(key),
    programme_name: e.programme_name ?? '',
    issuer_name: e.issuer_name ?? '',
    issuer_type: e.issuer_type ?? 'Not specified',
    official_status: ctx.officialSource,
    status: computeStatus(e.opening_date, e.closing_date, now),
    funding_type: e.funding_type ?? FundingType.GRANT,
    target_stage: e.thresholds.length ? e.thresholds.map((t) => t.name).join(' / ') : 'Not specified',
    legal_form_required: [],
    sector_tags: e.sector_tags.length ? e.sector_tags : ['Any'],
    geo_scope: e.geo_scope ?? 'Not specified',
    amount_min: e.amount_min ?? 0,
    amount_max: e.amount_max ?? 0,
    non_cash_support: 'None',
    eligibility_summary: e.eligibility_summary ?? '',
    required_documents: e.required_documents,
    application_url: e.application_url ?? '',
    source_url: ctx.sourceUrl ?? e.application_url ?? '',
    closing_date: closing,
    frequency: e.is_rolling ? 'Always Open' : 'Intake window',
    contact_email: e.contact_email ?? '',
    contact_phone: e.contact_phone ?? '',
    last_verified_at: now.toISOString(),
    verification_notes: `Checked by an admin on ${day} against the original ${ctx.sourceType} document.`,
    // Human-reviewed: 90 when the admin confirms an official source, 70 otherwise.
    confidence_score: ctx.officialSource ? 90 : 70,
    review_status: 'published',
    dedupe_key: key,
    source_type: ctx.sourceType,
    published_at: now.toISOString(),
    ...(e.form_url ? { pdf_form_url: e.form_url } : {}),
    ...(e.opening_date ? { opening_date: e.opening_date } : {}),
    ...(e.cycle_label ? { cycle_label: e.cycle_label } : {}),
    ...(e.how_to_apply ? { how_to_apply: e.how_to_apply } : {}),
    ...(e.application_channel ? { application_channel: e.application_channel } : {}),
    ...(e.emailed_applications_accepted !== null ? { emailed_applications_accepted: e.emailed_applications_accepted } : {}),
    ...(e.thresholds.length ? { thresholds: e.thresholds } : {}),
    ...(hasRules ? { eligibility_rules: rules } : {}),
  };
}

export async function publishDraft(
  db: Firestore,
  draftId: string,
  opts: { edited?: unknown; officialSource: boolean; reviewer: string }
): Promise<FundingOpportunityDb> {
  const draft = await getDraft(db, draftId);
  if (draft.review_status !== 'pending') throw new IntakeError(409, 'Only pending drafts can be published.');

  const extracted = opts.edited !== undefined ? normalizeExtracted(opts.edited) : draft.extracted;
  const problems = publishProblems(extracted);
  if (problems.length) throw new IntakeError(422, 'This record is not ready to publish yet.', problems);

  const record = toPublishedRecord({
    extracted,
    officialSource: opts.officialSource,
    sourceType: draft.source_type,
    sourceUrl: draft.source_url,
  });

  const now = new Date().toISOString();
  const batch = db.batch();
  batch.set(db.collection(COLLECTIONS.PUBLISHED).doc(record.opportunity_id), record);
  batch.update(db.collection(COLLECTIONS.DRAFTS).doc(draftId), {
    extracted,
    dedupe_key: record.dedupe_key,
    review_status: 'published',
    published_id: record.opportunity_id,
    published_at: now,
    reviewed_by: opts.reviewer,
    updated_at: now,
  });
  await batch.commit();

  // Fire-and-forget: walk every user's profile and notify eligible ones
  // (in-app + email + WhatsApp + push, depending on their alert prefs).
  // Never blocks the publish, never throws — a failed alert must not roll
  // back the Firestore write.
  notifyMatchingUsers(db, record).catch((e) =>
    console.warn('[Intake] Could not notify matching users:', e)
  );

  return record;
}

// ─── Admin alerts (optional) ─────────────────────────────────────────────────

/**
 * Sends the admin a Telegram message when TELEGRAM_BOT_TOKEN and
 * TELEGRAM_CHAT_ID are set. Silent no-op otherwise. Never throws.
 */
export async function notifyAdmin(message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message.slice(0, 3500), disable_web_page_preview: true }),
    });
    return res.ok;
  } catch (e) {
    console.warn('[Alerts] Telegram send failed:', e instanceof Error ? e.message : e);
    return false;
  }
}
