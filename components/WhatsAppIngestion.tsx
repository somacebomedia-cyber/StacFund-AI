// components/WhatsAppIngestion.tsx
/**
 * Add-a-funding-opportunity screen (admin only).
 *
 * This file keeps its old name and export so Dashboard.tsx needs no wiring
 * changes, but it is no longer a WhatsApp demo. It does three real things:
 *   1. Reads a poster photo, PDF or pasted text with Gemini (via /api/intake/extract)
 *   2. Lets you check and correct every field in a review queue
 *   3. Publishes the checked record to the public directory
 *
 * The server decides who is an admin (ADMIN_EMAILS / ADMIN_UIDS). Everyone else
 * just sees an "admin only" notice.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Loader2, Plus, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { auth } from '../services/firebase';
import type { DraftWithId, ExtractedOpportunity, FundingThreshold, User } from '../types';

interface WhatsAppIngestionProps {
  user: User | null;
  onClose: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const API = {
  ME: '/api/intake/me',
  EXTRACT: '/api/intake/extract',
  DRAFTS: '/api/intake/drafts',
} as const;

const ACCEPTED_FILES = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2000; // photos are shrunk before upload to save mobile data
const FUNDING_TYPES = ['GRANT', 'LOAN', 'EQUITY', 'HYBRID', 'COMPETITION'] as const;
const CHANNELS = ['ONLINE', 'IN_PERSON', 'EMAIL', 'POST', 'MIXED'] as const;

const INPUT_CLASS =
  'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-cyan-400/60 focus:outline-none';
const LABEL_CLASS = 'mb-1 block text-[11px] font-bold uppercase tracking-widest text-gray-400';

// ─── API helper ──────────────────────────────────────────────────────────────

class ApiError extends Error {
  public readonly status: number;
  public readonly details: string[];
  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

interface ErrorBody {
  error?: string;
  details?: unknown;
}

async function api<T>(path: string, init?: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown }): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new ApiError(401, 'Please sign in again.');
  const hasBody = init?.body !== undefined;
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(hasBody ? { 'Content-Type': 'application/json' } : {}) },
    body: hasBody ? JSON.stringify(init?.body) : undefined,
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const body = data as ErrorBody;
    const details = Array.isArray(body.details) ? body.details.filter((d): d is string => typeof d === 'string') : [];
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, details);
  }
  return data as T;
}

interface ExtractResponse {
  drafts: DraftWithId[];
  warnings: string[];
}
interface DraftsResponse {
  drafts: DraftWithId[];
}
interface DraftResponse {
  draft: DraftWithId;
}

// ─── File helpers ────────────────────────────────────────────────────────────

function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/** Shrinks phone photos to a readable size (about 2000 px) so uploads are small. PDFs pass through untouched. */
async function prepareFile(file: File): Promise<{ mimeType: string; dataBase64: string; fileName: string }> {
  if (file.type === 'application/pdf') {
    return { mimeType: 'application/pdf', dataBase64: await readAsBase64(file), fileName: file.name };
  }
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not open that image.'));
      el.src = url;
    });
    URL.revokeObjectURL(url);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Could not shrink the image.');
    return { mimeType: 'image/jpeg', dataBase64: await readAsBase64(blob), fileName: file.name };
  } catch {
    return { mimeType: file.type || 'image/jpeg', dataBase64: await readAsBase64(file), fileName: file.name };
  }
}

// ─── Small form pieces ───────────────────────────────────────────────────────

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className={LABEL_CLASS}>{label}</span>
    {children}
  </label>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
    <h3 className="text-xs font-black uppercase tracking-widest text-cyan-300">{title}</h3>
    {children}
  </section>
);

const toText = (v: string | null): string => v ?? '';
const toNumberInput = (v: number | null): string => (v === null ? '' : String(v));
const fromNumberInput = (s: string): number | null => (s.trim() === '' ? null : Math.max(0, Number(s)));
const fromText = (s: string): string | null => (s.trim() === '' ? null : s);
const toLines = (items: string[]): string => items.join('\n');
const fromLines = (s: string): string[] => s.split('\n').map((l) => l.trim()).filter(Boolean);

interface RawLists {
  sector_tags: string;
  sectors_excluded: string;
  required_documents: string;
}

const rawListsOf = (e: ExtractedOpportunity): RawLists => ({
  sector_tags: toLines(e.sector_tags),
  sectors_excluded: toLines(e.sectors_excluded),
  required_documents: toLines(e.required_documents),
});

// ─── Component ───────────────────────────────────────────────────────────────

type Busy = 'load' | 'extract' | 'save' | 'publish' | 'reject' | null;
interface Notice {
  kind: 'error' | 'success' | 'info';
  text: string;
  details?: string[];
}

export const WhatsAppIngestion: React.FC<WhatsAppIngestionProps> = ({ onClose }) => {
  const [adminState, setAdminState] = useState<'checking' | 'ok' | 'denied' | 'error'>('checking');
  const [adminMessage, setAdminMessage] = useState('');
  const [tab, setTab] = useState<'add' | 'queue'>('add');
  const [drafts, setDrafts] = useState<DraftWithId[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ExtractedOpportunity | null>(null);
  const [raw, setRaw] = useState<RawLists>({ sector_tags: '', sectors_excluded: '', required_documents: '' });
  const [officialSource, setOfficialSource] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);

  const selected = drafts.find((d) => d.id === selectedId) ?? null;

  const openDraft = useCallback((draft: DraftWithId) => {
    setSelectedId(draft.id);
    setForm(draft.extracted);
    setRaw(rawListsOf(draft.extracted));
    setOfficialSource(false);
  }, []);

  const loadQueue = useCallback(async () => {
    setBusy('load');
    try {
      const res = await api<DraftsResponse>(`${API.DRAFTS}?status=pending`);
      setDrafts(res.drafts);
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Could not load the review queue.' });
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api<{ admin: boolean }>(API.ME);
        if (cancelled) return;
        setAdminState('ok');
        await loadQueue();
      } catch (e) {
        if (cancelled) return;
        setAdminState(e instanceof ApiError && e.status === 403 ? 'denied' : 'error');
        setAdminMessage(e instanceof Error ? e.message : 'Could not reach the server.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadQueue]);

  const upsertDraft = (draft: DraftWithId) => {
    setDrafts((prev) => [draft, ...prev.filter((d) => d.id !== draft.id)]);
  };

  /** Current form + the line-based lists, ready to send to the server. */
  const payload = (): ExtractedOpportunity | null =>
    form
      ? {
          ...form,
          sector_tags: fromLines(raw.sector_tags),
          sectors_excluded: fromLines(raw.sectors_excluded),
          required_documents: fromLines(raw.required_documents),
        }
      : null;

  // ── Actions ────────────────────────────────────────────────────────────────

  const sendDocument = async (body: Record<string, unknown>, mergeIntoDraftId: string | null) => {
    setBusy('extract');
    setNotice(null);
    try {
      const res = await api<ExtractResponse>(API.EXTRACT, { method: 'POST', body: { ...body, ...(mergeIntoDraftId ? { mergeIntoDraftId } : {}) } });
      res.drafts.forEach(upsertDraft);
      if (res.drafts[0]) openDraft(res.drafts[0]);
      setPasteText('');
      setNotice({
        kind: 'info',
        text: mergeIntoDraftId ? 'Added to this record. Check what changed.' : 'Read it. Please check every field before publishing.',
        details: res.warnings,
      });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Could not read that document.', details: e instanceof ApiError ? e.details : [] });
    } finally {
      setBusy(null);
    }
  };

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>, mergeIntoDraftId: string | null) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES * 3) {
      setNotice({ kind: 'error', text: 'That file is too large. Please use one under 30 MB.' });
      return;
    }
    setBusy('extract');
    try {
      const prepared = await prepareFile(file);
      await sendDocument({ kind: 'file', ...prepared }, mergeIntoDraftId);
    } catch (err) {
      setBusy(null);
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not prepare that file.' });
    }
  };

  const readPastedText = () => sendDocument({ kind: 'text', text: pasteText }, null);

  const save = async () => {
    const body = payload();
    if (!selected || !body) return;
    setBusy('save');
    setNotice(null);
    try {
      const res = await api<DraftResponse>(`${API.DRAFTS}/${selected.id}`, { method: 'PUT', body: { extracted: body } });
      upsertDraft(res.draft);
      openDraft(res.draft);
      setNotice({ kind: 'success', text: 'Saved. It is still private until you publish it.' });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    const body = payload();
    if (!selected || !body) return;
    setBusy('publish');
    setNotice(null);
    try {
      await api<{ published: { programme_name: string } }>(`${API.DRAFTS}/${selected.id}/publish`, {
        method: 'POST',
        body: { extracted: body, officialSource },
      });
      setDrafts((prev) => prev.filter((d) => d.id !== selected.id));
      setSelectedId(null);
      setForm(null);
      setTab('queue');
      setNotice({ kind: 'success', text: `Published: ${body.programme_name ?? 'opportunity'}. It is now in the directory.` });
      // Tell other pages (Dashboard, FundingExplorer) to drop their cached opportunity list.
      window.dispatchEvent(new Event('stacfund_opportunities_invalidated'));
    } catch (e) {
      setNotice({
        kind: 'error',
        text: e instanceof Error ? e.message : 'Could not publish.',
        details: e instanceof ApiError ? e.details : [],
      });
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    if (!selected) return;
    if (!window.confirm('Reject this record? It will be removed from the queue.')) return;
    setBusy('reject');
    setNotice(null);
    try {
      await api<{ ok: boolean }>(`${API.DRAFTS}/${selected.id}/reject`, { method: 'POST', body: {} });
      setDrafts((prev) => prev.filter((d) => d.id !== selected.id));
      setSelectedId(null);
      setForm(null);
      setTab('queue');
      setNotice({ kind: 'info', text: 'Rejected.' });
      // Rejection doesn't change the public list, but invalidate is cheap and keeps the queue consistent.
      window.dispatchEvent(new Event('stacfund_opportunities_invalidated'));
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Could not reject.' });
    } finally {
      setBusy(null);
    }
  };

  // The value is passed in (read inside the event handler), never read later inside a state updater.
  const setRawList = (key: keyof RawLists, value: string) => setRaw((r) => ({ ...r, [key]: value }));

  const update = (patch: Partial<ExtractedOpportunity>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const updateThreshold = (index: number, patch: Partial<FundingThreshold>) =>
    setForm((prev) =>
      prev ? { ...prev, thresholds: prev.thresholds.map((t, i) => (i === index ? { ...t, ...patch } : t)) } : prev
    );

  const removeThreshold = (index: number) =>
    setForm((prev) => (prev ? { ...prev, thresholds: prev.thresholds.filter((_, i) => i !== index) } : prev));

  // ── Render pieces ──────────────────────────────────────────────────────────

  const noticeBox = notice && (
    <div
      role="status"
      className={`rounded-xl border px-4 py-3 text-sm ${
        notice.kind === 'error'
          ? 'border-red-500/30 bg-red-500/10 text-red-200'
          : notice.kind === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
            : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100'
      }`}
    >
      <p>{notice.text}</p>
      {notice.details && notice.details.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs opacity-90">
          {notice.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );

  const addPanel = (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-gray-300">
        Upload a poster photo or a PDF, or paste the text of a message. The AI only copies what the document says. Nothing is shown to users until you check it and publish.
      </p>
      <button
        type="button"
        onClick={() => addInputRef.current?.click()}
        disabled={busy !== null}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 py-4 text-sm font-black uppercase tracking-widest text-black transition hover:bg-cyan-400 disabled:opacity-50"
      >
        {busy === 'extract' ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
        {busy === 'extract' ? 'Reading the document…' : 'Choose photo or PDF'}
      </button>
      <input ref={addInputRef} type="file" accept={ACCEPTED_FILES} className="hidden" onChange={(e) => void onFilePicked(e, null)} />
      <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-gray-500">
        <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
      </div>
      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        rows={6}
        placeholder="Paste the text of a WhatsApp message, web page or email here"
        className={INPUT_CLASS}
      />
      <button
        type="button"
        onClick={() => void readPastedText()}
        disabled={busy !== null || pasteText.trim().length < 40}
        className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10 disabled:opacity-40"
      >
        Read this text
      </button>
    </div>
  );

  const queuePanel = (
    <div className="space-y-3">
      {busy === 'load' && drafts.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Loading the queue…
        </p>
      )}
      {busy !== 'load' && drafts.length === 0 && (
        <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-gray-400">
          Nothing is waiting for review. New finds from the scraper and anything you add will show up here.
        </p>
      )}
      {drafts.map((d) => {
        const e = d.extracted;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => openDraft(d)}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-cyan-400/40"
          >
            <p className="text-sm font-bold text-white">{e.programme_name ?? 'Untitled'}</p>
            <p className="mt-0.5 text-xs text-gray-400">{e.issuer_name ?? 'Issuer not stated'}</p>
            <p className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wider">
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-gray-300">
                Closes: {e.closing_date ?? (e.is_rolling ? 'Open all year' : e.closing_date_text ?? 'not stated')}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-gray-300">{d.source_type}</span>
              {e.risk_flags.length > 0 && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-red-300">Risk flags</span>}
              {d.possible_duplicate_of && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-300">Already published</span>}
            </p>
          </button>
        );
      })}
    </div>
  );

  const editor =
    selected && form ? (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
            setForm(null);
            setNotice(null);
          }}
          className="text-xs font-bold uppercase tracking-widest text-cyan-300"
        >
          ← Back to the queue
        </button>

        {(form.risk_flags.length > 0 || form.extraction_notes.length > 0 || selected.change_note || selected.possible_duplicate_of) && (
          <Section title="Check these first">
            {form.risk_flags.map((r) => (
              <p key={r} className="flex items-start gap-2 text-sm text-red-300">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {r}
              </p>
            ))}
            {selected.change_note && <p className="text-sm text-amber-300">{selected.change_note}</p>}
            {selected.possible_duplicate_of && !selected.change_note && (
              <p className="text-sm text-amber-300">An opportunity with the same name and year is already published. Publishing this replaces it.</p>
            )}
            {form.extraction_notes.map((n) => (
              <p key={n} className="text-sm text-amber-200">• {n}</p>
            ))}
          </Section>
        )}

        <Section title="The basics">
          <Field label="Programme name">
            <input className={INPUT_CLASS} value={toText(form.programme_name)} onChange={(e) => update({ programme_name: fromText(e.target.value) })} />
          </Field>
          <Field label="Offered by">
            <input className={INPUT_CLASS} value={toText(form.issuer_name)} onChange={(e) => update({ issuer_name: fromText(e.target.value) })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Funding type">
              <select className={INPUT_CLASS} value={form.funding_type ?? ''} onChange={(e) => update({ funding_type: fromText(e.target.value) })}>
                <option value="">Choose…</option>
                {FUNDING_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Cycle (optional)">
              <input className={INPUT_CLASS} value={toText(form.cycle_label)} onChange={(e) => update({ cycle_label: fromText(e.target.value) })} placeholder="e.g. 2026/27" />
            </Field>
          </div>
          <Field label="Province or area">
            <input className={INPUT_CLASS} value={toText(form.geo_scope)} onChange={(e) => update({ geo_scope: fromText(e.target.value) })} />
          </Field>
        </Section>

        <Section title="Dates">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opens">
              <input type="date" className={INPUT_CLASS} value={toText(form.opening_date)} onChange={(e) => update({ opening_date: fromText(e.target.value) })} />
            </Field>
            <Field label="Closes">
              <input type="date" className={INPUT_CLASS} value={toText(form.closing_date)} onChange={(e) => update({ closing_date: fromText(e.target.value) })} />
            </Field>
          </div>
          {form.closing_date_text && <p className="text-xs text-gray-400">As written on the document: “{form.closing_date_text}”</p>}
          <label className="flex items-center gap-2 text-sm text-gray-200">
            <input type="checkbox" checked={form.is_rolling === true} onChange={(e) => update({ is_rolling: e.target.checked })} />
            Open all year (no closing date)
          </label>
        </Section>

        <Section title="Who can apply">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Min age">
              <input type="number" inputMode="numeric" className={INPUT_CLASS} value={toNumberInput(form.age_min)} onChange={(e) => update({ age_min: fromNumberInput(e.target.value) })} />
            </Field>
            <Field label="Max age">
              <input type="number" inputMode="numeric" className={INPUT_CLASS} value={toNumberInput(form.age_max)} onChange={(e) => update({ age_max: fromNumberInput(e.target.value) })} />
            </Field>
            <Field label="Youth owned %">
              <input type="number" inputMode="numeric" className={INPUT_CLASS} value={toNumberInput(form.youth_ownership_min_pct)} onChange={(e) => update({ youth_ownership_min_pct: fromNumberInput(e.target.value) })} />
            </Field>
          </div>
          <Field label="Sectors supported (one per line)">
            <textarea rows={4} className={INPUT_CLASS} value={raw.sector_tags} onChange={(e) => setRawList('sector_tags', e.target.value)} />
          </Field>
          <Field label="Sectors NOT funded (one per line)">
            <textarea rows={3} className={INPUT_CLASS} value={raw.sectors_excluded} onChange={(e) => setRawList('sectors_excluded', e.target.value)} />
          </Field>
          <Field label="Eligibility in plain words">
            <textarea rows={4} className={INPUT_CLASS} value={toText(form.eligibility_summary)} onChange={(e) => update({ eligibility_summary: fromText(e.target.value) })} />
          </Field>
        </Section>

        <Section title="Money (rand)">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Smallest amount">
              <input type="number" inputMode="numeric" className={INPUT_CLASS} value={toNumberInput(form.amount_min)} onChange={(e) => update({ amount_min: fromNumberInput(e.target.value) })} />
            </Field>
            <Field label="Largest amount">
              <input type="number" inputMode="numeric" className={INPUT_CLASS} value={toNumberInput(form.amount_max)} onChange={(e) => update({ amount_max: fromNumberInput(e.target.value) })} />
            </Field>
          </div>
          {form.thresholds.map((t, i) => (
            <div key={`${t.name}-${i}`} className="space-y-2 rounded-xl border border-white/10 p-3">
              <div className="flex items-center gap-2">
                <input className={INPUT_CLASS} value={t.name} onChange={(e) => updateThreshold(i, { name: e.target.value })} aria-label="Tier name" />
                <button type="button" onClick={() => removeThreshold(i)} className="rounded-lg p-2 text-gray-400 hover:text-red-300" aria-label="Remove this tier">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="From">
                  <input type="number" inputMode="numeric" className={INPUT_CLASS} value={toNumberInput(t.amount_min)} onChange={(e) => updateThreshold(i, { amount_min: fromNumberInput(e.target.value) })} />
                </Field>
                <Field label="To">
                  <input type="number" inputMode="numeric" className={INPUT_CLASS} value={toNumberInput(t.amount_max)} onChange={(e) => updateThreshold(i, { amount_max: fromNumberInput(e.target.value) })} />
                </Field>
                <Field label="Min jobs">
                  <input type="number" inputMode="numeric" className={INPUT_CLASS} value={toNumberInput(t.min_jobs)} onChange={(e) => updateThreshold(i, { min_jobs: fromNumberInput(e.target.value) })} />
                </Field>
              </div>
              {t.requirements.length > 0 && <p className="text-xs text-gray-400">{t.requirements.length} requirement(s) kept from the document.</p>}
            </div>
          ))}
        </Section>

        <Section title="How to apply">
          <Field label="How to apply, in plain words">
            <textarea rows={3} className={INPUT_CLASS} value={toText(form.how_to_apply)} onChange={(e) => update({ how_to_apply: fromText(e.target.value) })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Submit by">
              <select className={INPUT_CLASS} value={form.application_channel ?? ''} onChange={(e) => update({ application_channel: (CHANNELS as readonly string[]).includes(e.target.value) ? (e.target.value as ExtractedOpportunity['application_channel']) : null })}>
                <option value="">Not stated</option>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>{c.replace('_', ' ')}</option>
                ))}
              </select>
            </Field>
            <Field label="Emailed forms accepted?">
              <select
                className={INPUT_CLASS}
                value={form.emailed_applications_accepted === null ? '' : form.emailed_applications_accepted ? 'yes' : 'no'}
                onChange={(e) => update({ emailed_applications_accepted: e.target.value === '' ? null : e.target.value === 'yes' })}
              >
                <option value="">Not stated</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
          </div>
          <Field label="Documents applicants must submit (one per line)">
            <textarea rows={5} className={INPUT_CLASS} value={raw.required_documents} onChange={(e) => setRawList('required_documents', e.target.value)} />
          </Field>
          <Field label="Application link">
            <input type="url" className={INPUT_CLASS} value={toText(form.application_url)} onChange={(e) => update({ application_url: fromText(e.target.value) })} placeholder="https://" />
          </Field>
          <Field label="Link to the form (PDF)">
            <input type="url" className={INPUT_CLASS} value={toText(form.form_url)} onChange={(e) => update({ form_url: fromText(e.target.value) })} placeholder="https://" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact email">
              <input type="email" className={INPUT_CLASS} value={toText(form.contact_email)} onChange={(e) => update({ contact_email: fromText(e.target.value) })} />
            </Field>
            <Field label="Contact phone">
              <input type="tel" className={INPUT_CLASS} value={toText(form.contact_phone)} onChange={(e) => update({ contact_phone: fromText(e.target.value) })} />
            </Field>
          </div>
        </Section>

        {form.evidence.length > 0 && (
          <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-gray-300">Quotes the AI used</summary>
            <ul className="mt-3 space-y-2 text-sm text-gray-300">
              {form.evidence.map((q) => (
                <li key={q} className="border-l-2 border-cyan-400/40 pl-3">“{q}”</li>
              ))}
            </ul>
          </details>
        )}

        <Section title="Before you publish">
          <label className="flex items-start gap-2 text-sm text-gray-200">
            <input type="checkbox" className="mt-1" checked={officialSource} onChange={(e) => setOfficialSource(e.target.checked)} />
            <span>
              <ShieldCheck size={14} className="mr-1 inline text-emerald-400" />
              I confirmed this on the funder’s official website, page or office.
            </span>
          </label>
          <button
            type="button"
            onClick={() => mergeInputRef.current?.click()}
            disabled={busy !== null}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cyan-300 disabled:opacity-40"
          >
            <Plus size={14} /> Add the application form or another document to this record
          </button>
          <input ref={mergeInputRef} type="file" accept={ACCEPTED_FILES} className="hidden" onChange={(e) => void onFilePicked(e, selected.id)} />
        </Section>
      </div>
    ) : null;

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md sm:p-4" role="dialog" aria-modal="true" aria-label="Add a funding opportunity">
      <div className="relative flex h-full w-full max-w-3xl flex-col overflow-hidden border border-white/10 bg-[#0a0a1a] shadow-2xl sm:h-[92vh] sm:rounded-[2rem]">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-white">Add a funding opportunity</h2>
            <p className="text-xs text-gray-400">Read by AI, checked by you, then published</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20" aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {adminState === 'checking' && (
            <p className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={16} className="animate-spin" /> Checking your access…
            </p>
          )}
          {adminState === 'denied' && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100">
              <p className="font-bold">Admin only</p>
              <p className="mt-1 opacity-90">{adminMessage}</p>
            </div>
          )}
          {adminState === 'error' && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-100">
              <p className="font-bold">Could not reach the server</p>
              <p className="mt-1 opacity-90">{adminMessage}</p>
            </div>
          )}

          {adminState === 'ok' && (
            <>
              {noticeBox}
              {editor ?? (
                <>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/5 p-1 text-xs font-black uppercase tracking-widest">
                    <button type="button" onClick={() => setTab('add')} className={`rounded-xl px-3 py-2.5 ${tab === 'add' ? 'bg-cyan-500 text-black' : 'text-gray-300'}`}>
                      Add new
                    </button>
                    <button type="button" onClick={() => setTab('queue')} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 ${tab === 'queue' ? 'bg-cyan-500 text-black' : 'text-gray-300'}`}>
                      <Inbox size={14} /> Review queue ({drafts.length})
                    </button>
                  </div>
                  {tab === 'add' ? addPanel : queuePanel}
                </>
              )}
            </>
          )}
        </div>

        {adminState === 'ok' && editor && (
          <footer className="grid grid-cols-3 gap-2 border-t border-white/10 bg-[#0a0a1a] px-4 py-3">
            <button type="button" onClick={() => void reject()} disabled={busy !== null} className="rounded-xl border border-red-500/30 px-3 py-3 text-xs font-black uppercase tracking-widest text-red-300 disabled:opacity-40">
              {busy === 'reject' ? '…' : 'Reject'}
            </button>
            <button type="button" onClick={() => void save()} disabled={busy !== null} className="rounded-xl border border-white/15 px-3 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40">
              {busy === 'save' ? 'Saving…' : 'Save draft'}
            </button>
            <button type="button" onClick={() => void publish()} disabled={busy !== null} className="flex items-center justify-center gap-1 rounded-xl bg-emerald-500 px-3 py-3 text-xs font-black uppercase tracking-widest text-black disabled:opacity-40">
              {busy === 'publish' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Publish
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};

export default WhatsAppIngestion;
