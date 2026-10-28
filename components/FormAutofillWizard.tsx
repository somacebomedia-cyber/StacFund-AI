// components/FormAutofillWizard.tsx
/**
 * "Fill the official form" screen.
 *
 * Loads what the applicant already told us (their profile), asks for the rest,
 * checks the answers against the form's own rules, and writes them onto the
 * official PDF in the browser. Nothing is sent to a server or to an AI, and the
 * signature, date and declaration boxes are always left blank.
 *
 * Answers are kept in sessionStorage so an accidental refresh does not lose
 * them. sessionStorage is cleared when the tab is closed, which is safer on
 * shared phones and library computers than localStorage.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, Download, ExternalLink, Loader2, Plus, ShieldCheck, X } from 'lucide-react';
import { db } from '../services/firebase';
import { fillFormPdf, looksLikePdf } from '../services/formAutofill';
import { conditionHolds, isBlank, isPortalTemplate, labelMap, stripTrailingCents } from '../services/formModel';
import type { AnswerMap, FormSection, FormTemplate, PortalFormTemplate, ProfileSource, Question, RowGroup } from '../services/formModel';
import type { User } from '../types';

interface FormAutofillWizardProps {
  template: FormTemplate | PortalFormTemplate;
  user: User;
  onClose: () => void;
}

const INPUT_CLASS =
  'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-cyan-400/60 focus:outline-none';
const LABEL_CLASS = 'mb-1 block text-[11px] font-bold uppercase tracking-widest text-gray-400';

interface Generated {
  kind: 'pdf' | 'json';
  // PDF path
  url?: string;
  fileName?: string;
  cutLabels?: string[];
  // JSON path
  jsonText?: string;
  portalUrl?: string;
}

const draftKey = (userId: string, templateId: string): string => `stacfund_form_draft:${userId}:${templateId}`;

function readDraft(key: string): AnswerMap {
  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    const out: AnswerMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === 'string') out[k] = v;
    return out;
  } catch {
    return {};
  }
}

function saveDraft(key: string, answers: AnswerMap): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(answers));
  } catch {
    /* storage can be full or blocked; the wizard still works without it */
  }
}

async function loadProfileSource(user: User): Promise<ProfileSource> {
  let profile: Record<string, unknown> | undefined;
  let ownerInfo: Record<string, unknown> | undefined;
  let documentCategories: string[] = [];
  try {
    const snap = await getDoc(doc(db, 'users', user.id));
    const data = snap.exists() ? (snap.data() as { profile?: Record<string, unknown>; ownerInfo?: Record<string, unknown> }) : {};
    profile = data.profile;
    ownerInfo = data.ownerInfo;
  } catch (e) {
    console.error('Could not read the profile for autofill', e);
  }
  try {
    const docs = await getDocs(collection(db, 'users', user.id, 'documents'));
    documentCategories = docs.docs.map((d) => String((d.data() as { category?: unknown }).category ?? ''));
  } catch (e) {
    console.error('Could not read documents for autofill', e);
  }
  return { email: user.email, businessName: user.businessName, whatsapp: user.whatsapp, profile, ownerInfo, documentCategories };
}

const digitsOnly = (v: string, max?: number): string => {
  // A pasted decimal part ("350000.50") is dropped, not glued on as extra digits.
  const d = stripTrailingCents(v).replace(/\D/g, '');
  return max ? d.slice(0, max) : d;
};

const FormAutofillWizard: React.FC<FormAutofillWizardProps> = ({ template, user, onClose }) => {
  const isPortal = isPortalTemplate(template);
  const storageKey = draftKey(user.id, template.id);
  const labels = useMemo(() => labelMap(template), [template]);

  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [fromProfile, setFromProfile] = useState<AnswerMap>({});
  const [open, setOpen] = useState<string>(template.sections[0]?.id ?? '');
  const [rowsShown, setRowsShown] = useState<Record<string, number>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<Generated | null>(null);

  const rowsFor = useCallback(
    (group: RowGroup, a: AnswerMap): number => {
      let last = 1;
      for (let n = 1; n <= group.maxRows; n++) {
        if (group.columns.some((c) => !isBlank(a[group.keyFor(n, c.field)]))) last = n;
      }
      return last;
    },
    []
  );

  // Load the profile once, then layer anything typed earlier in this tab on top.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const source = await loadProfileSource(user);
      if (cancelled) return;
      const prefilled = template.prefill(source);
      const merged = { ...prefilled, ...readDraft(storageKey) };
      setFromProfile(prefilled);
      setAnswers(merged);
      const shown: Record<string, number> = {};
      for (const s of template.sections) for (const g of s.rowGroups ?? []) shown[g.id] = rowsFor(g, merged);
      setRowsShown(shown);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, template, storageKey, rowsFor]);

  useEffect(() => {
    if (!loading) saveDraft(storageKey, answers);
  }, [answers, loading, storageKey]);

  // Esc closes the screen (same as the X button); never while a PDF is being made.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !generating) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [generating, onClose]);

  // Free the generated file's memory when the screen closes.
  useEffect(() => {
    return () => {
      if (result?.kind === 'pdf' && result.url) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  const validation = useMemo(() => template.validate(answers), [template, answers]);
  const setAnswer = (key: string, value: string) => {
    setResult(null);
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const errorFor = (key: string): string | null => (showErrors ? validation.errors.find((e) => e.key === key)?.message ?? null : null);
  const warningFor = (key: string): string | null => validation.warnings.find((w) => w.key === key)?.message ?? null;

  const missingIn = (section: FormSection): number => validation.errors.filter((e) => e.key?.startsWith(`${section.id}.`)).length;

  // ── Generate ────────────────────────────────────────────────────────────────

  const generate = async () => {
    setFailure(null);
    if (validation.errors.length > 0) {
      setShowErrors(true);
      const firstKey = validation.errors[0].key ?? '';
      const target = template.sections.find((s) => firstKey.startsWith(`${s.id}.`));
      if (target) setOpen(target.id);
      return;
    }
    if (!confirmed) {
      setShowErrors(true);
      return;
    }
    if (isPortal) {
      // Portal path: build the JSON the applicant pastes into the portal.
      const portal = template as PortalFormTemplate;
      const json = portal.toPortalJson(answers);
      setResult({
        kind: 'json',
        jsonText: JSON.stringify(json, null, 2),
        portalUrl: portal.portalUrl,
      });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch((template as FormTemplate).assetPath);
      if (!res.ok) throw new Error(`The blank form could not be loaded (${res.status}).`);
      const blank = new Uint8Array(await res.arrayBuffer());
      if (!looksLikePdf(blank)) throw new Error('The blank form file is missing or damaged. Please tell support.');
      const { bytes, cutKeys } = await fillFormPdf(template as FormTemplate, blank, answers);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const name = (answers['a.business_name'] || answers['biz.name'] || 'application').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'application';
      setResult({ kind: 'pdf', url, fileName: `${name}-${template.id}.pdf`, cutLabels: cutKeys.map((k) => labels[k] ?? k) });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Could not create the PDF.');
    } finally {
      setGenerating(false);
    }
  };

  const startAgain = () => {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setAnswers({ ...fromProfile });
    setConfirmed(false);
    setShowErrors(false);
    setResult(null);
  };

  // ── Pieces ──────────────────────────────────────────────────────────────────

  const renderQuestion = (q: Question) => {
    if (q.showIf && !conditionHolds(q.showIf, answers)) return null;
    const value = answers[q.key] ?? '';
    const err = errorFor(q.key);
    const warn = warningFor(q.key);
    const profileChip = !isBlank(value) && fromProfile[q.key] === value;
    const label = (
      <span className={LABEL_CLASS}>
        {q.label}
        {q.required && <span className="text-red-300"> *</span>}
        {profileChip && <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] normal-case tracking-normal text-emerald-300">from your profile</span>}
      </span>
    );
    let control: React.ReactNode;
    if (q.type === 'check') {
      return (
        <label key={q.key} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-gray-200">
          <input type="checkbox" className="mt-1" checked={value === 'yes'} onChange={(e) => setAnswer(q.key, e.target.checked ? 'yes' : '')} />
          <span>{q.label}</span>
        </label>
      );
    }
    if (q.type === 'choice' && q.options) {
      control =
        q.options.length > 4 ? (
          <select className={INPUT_CLASS} value={value} onChange={(e) => setAnswer(q.key, e.target.value)}>
            <option value="">Choose…</option>
            {q.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <div className="space-y-2">
            {q.options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setAnswer(q.key, o.value)}
                aria-pressed={value === o.value}
                className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${value === o.value ? 'border-cyan-400 bg-cyan-500/15 text-white' : 'border-white/10 bg-white/5 text-gray-300'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        );
    } else if (q.type === 'textarea') {
      control = (
        <>
          <textarea rows={5} className={INPUT_CLASS} value={value} maxLength={q.maxLength} onChange={(e) => setAnswer(q.key, e.target.value)} />
          {q.maxLength && <span className="mt-1 block text-right text-[11px] text-gray-500">{value.length}/{q.maxLength}</span>}
        </>
      );
    } else {
      control = (
        <input
          className={INPUT_CLASS}
          value={value}
          inputMode={q.inputMode ?? (q.type === 'number' ? 'numeric' : 'text')}
          maxLength={q.maxLength}
          placeholder={q.placeholder}
          onChange={(e) => setAnswer(q.key, q.type === 'number' ? digitsOnly(e.target.value, q.maxLength) : e.target.value)}
        />
      );
    }
    return (
      <div key={q.key} className="block">
        <label className="block">
          {label}
          {control}
        </label>
        {q.help && <p className="mt-1 text-xs text-gray-500">{q.help}</p>}
        {err && <p className="mt-1 text-xs text-red-300">{err}</p>}
        {!err && warn && <p className="mt-1 text-xs text-amber-300">{warn}</p>}
      </div>
    );
  };

  const renderRowGroup = (g: RowGroup) => {
    if (g.showIf && !conditionHolds(g.showIf, answers)) return null;
    const shown = rowsShown[g.id] ?? 1;
    return (
      <div key={g.id} className="space-y-3">
        <h4 className="text-xs font-black uppercase tracking-widest text-cyan-300">{g.title}</h4>
        {g.help && <p className="text-xs text-gray-500">{g.help}</p>}
        {Array.from({ length: shown }, (_, i) => i + 1).map((row) => (
          <div key={row} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Row {row}</p>
            <div className="grid grid-cols-2 gap-2">
              {g.columns.map((c) => {
                const key = g.keyFor(row, c.field);
                const err = errorFor(key);
                const profileChip = !isBlank(answers[key]) && fromProfile[key] === answers[key];
                return (
                  <label key={key} className="block">
                    <span className={LABEL_CLASS}>
                      {c.label}
                      {profileChip && <span className="ml-1 text-[10px] normal-case tracking-normal text-emerald-300">(profile)</span>}
                    </span>
                    <input
                      className={INPUT_CLASS}
                      value={answers[key] ?? ''}
                      inputMode={c.type === 'number' ? 'numeric' : 'text'}
                      maxLength={c.maxLength}
                      placeholder={c.placeholder}
                      onChange={(e) => setAnswer(key, c.type === 'number' ? digitsOnly(e.target.value, c.maxLength) : e.target.value)}
                    />
                    {err && <span className="mt-1 block text-xs text-red-300">{err}</span>}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {shown < g.maxRows && (
          <button type="button" onClick={() => setRowsShown((p) => ({ ...p, [g.id]: shown + 1 }))} className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cyan-300">
            <Plus size={14} /> Add another row
          </button>
        )}
      </div>
    );
  };

  // Warnings that belong to no particular visible field are listed before the button.
  const generalWarnings = validation.warnings;

  // ── Layout ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/90 backdrop-blur-md sm:p-4" role="dialog" aria-modal="true" aria-label="Fill the official form">
      <div className="relative flex h-full w-full max-w-3xl flex-col overflow-hidden border border-white/10 bg-[#0a0a1a] shadow-2xl sm:h-[92vh] sm:rounded-[2rem]">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-white">{isPortal ? 'Prepare your online application' : 'Fill the official form'}</h2>
            <p className="text-xs text-gray-400">{template.title}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20" aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={16} className="animate-spin" /> Getting your details…
            </p>
          ) : result ? (
            result.kind === 'json' ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
                  <p className="flex items-center gap-2 font-bold"><CheckCircle2 size={18} /> Your application JSON is ready</p>
                  <p className="mt-2 opacity-90">Open the portal, copy this JSON, and paste each field into the matching input. The portal stays the system of record — you submit it there.</p>
                </div>
                <a href={result.portalUrl} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 py-4 text-sm font-black uppercase tracking-widest text-black hover:bg-cyan-400">
                  <ExternalLink size={18} /> Open the portal
                </a>
                <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" open>
                  <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-cyan-300">Your application JSON</summary>
                  <textarea readOnly value={result.jsonText ?? ''} className="mt-3 h-64 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-gray-200" onFocus={(e) => e.target.select()} />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => { void navigator.clipboard?.writeText(result.jsonText ?? ''); }}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-3 text-xs font-black uppercase tracking-widest text-white"
                    >
                      <Copy size={14} /> Copy JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob([result.jsonText ?? ''], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${template.id}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-3 text-xs font-black uppercase tracking-widest text-white"
                    >
                      <Download size={14} /> Download JSON
                    </button>
                  </div>
                </details>
                <button type="button" onClick={() => setResult(null)} className="w-full rounded-2xl border border-white/15 px-4 py-3 text-sm font-bold text-white">
                  Change an answer
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
                  <p className="flex items-center gap-2 font-bold"><CheckCircle2 size={18} /> Your form is ready</p>
                  <p className="mt-2 opacity-90">Print it, sign and date it yourself, add certified copies of your documents, and hand it in at your nearest local or district municipal office. Emailed forms are not accepted.</p>
                </div>
                {result.cutLabels && result.cutLabels.length > 0 && (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                    <p className="font-bold">These answers were too long for their box and were shortened:</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{result.cutLabels.map((l) => <li key={l}>{l}</li>)}</ul>
                    <p className="mt-2 text-xs opacity-90">Make them shorter and create the PDF again, or attach one extra page, which the form allows.</p>
                  </div>
                )}
                {result.url && result.fileName && (
                  <a href={result.url} download={result.fileName} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 py-4 text-sm font-black uppercase tracking-widest text-black hover:bg-cyan-400">
                    <Download size={18} /> Download the filled PDF
                  </a>
                )}
                <button type="button" onClick={() => setResult(null)} className="w-full rounded-2xl border border-white/15 px-4 py-3 text-sm font-bold text-white">
                  Change an answer
                </button>
              </div>
            )
          ) : (
            <>
              <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-300">
                {template.intro.map((line) => (
                  <p key={line} className="flex items-start gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-400" /> {line}</p>
                ))}
                {isPortal && (
                  <details className="pt-1" open>
                    <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-cyan-300">How to use this in the portal</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-400">{(template as PortalFormTemplate).portalInstructions.map((r) => <li key={r}>{r}</li>)}</ul>
                  </details>
                )}
                <details className="pt-1">
                  <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-cyan-300">The fund’s rules, from the form</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-400">{template.rules.map((r) => <li key={r}>{r}</li>)}</ul>
                </details>
                <details>
                  <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-cyan-300">What this will never fill in</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-400">{template.neverFilled.map((r) => <li key={r}>{r}</li>)}</ul>
                </details>
              </div>

              {template.sections.map((section) => {
                const isOpen = open === section.id;
                const missing = missingIn(section);
                return (
                  <section key={section.id} className="rounded-2xl border border-white/10 bg-white/[0.02]">
                    <button type="button" onClick={() => setOpen(isOpen ? '' : section.id)} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left">
                      <span className="text-sm font-black text-white">{section.title}</span>
                      <span className="flex items-center gap-2 text-xs font-bold">
                        {missing > 0 ? <span className={showErrors ? 'text-red-300' : 'text-amber-300'}>{missing} to fill</span> : <span className="text-emerald-300">done</span>}
                        <ChevronDown size={16} className={`transition ${isOpen ? 'rotate-180' : ''}`} />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="space-y-4 px-4 pb-4">
                        {section.intro && <p className="text-xs text-gray-400">{section.intro}</p>}
                        {section.questions.map(renderQuestion)}
                        {(section.rowGroups ?? []).map(renderRowGroup)}
                      </div>
                    )}
                  </section>
                );
              })}

              {generalWarnings.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-100">
                  <p className="flex items-center gap-2 text-sm font-bold"><AlertTriangle size={16} /> Check before you print</p>
                  <ul className="list-disc space-y-1 pl-5">{generalWarnings.map((w) => <li key={w.message}>{w.message}</li>)}</ul>
                </div>
              )}

              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-200">
                <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <span>{isPortal ? 'I checked every answer. They are true and complete, and I understand I will paste the JSON into the portal and submit it myself.' : 'I checked every answer. They are true and complete, and I understand I must sign and date the form myself.'}</span>
              </label>
              {showErrors && !confirmed && validation.errors.length === 0 && <p className="text-xs text-red-300">Tick the box above to confirm your answers.</p>}
              {showErrors && validation.errors.length > 0 && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-100">
                  <p className="font-bold">Still needed before the PDF can be made:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">{validation.errors.map((e) => <li key={`${e.key}-${e.message}`}>{e.message}</li>)}</ul>
                </div>
              )}
              {failure && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{failure}</p>}
            </>
          )}
        </div>

        {!loading && !result && (
          <footer className="grid grid-cols-3 gap-2 border-t border-white/10 bg-[#0a0a1a] px-4 py-3">
            <button type="button" onClick={startAgain} className="rounded-xl border border-white/15 px-3 py-3 text-xs font-black uppercase tracking-widest text-gray-300">
              Start again
            </button>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={generating}
              className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-3 py-3 text-xs font-black uppercase tracking-widest text-black disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : isPortal ? <Copy size={14} /> : <Download size={14} />} {isPortal ? 'Create my JSON' : 'Create my PDF'}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};

export default FormAutofillWizard;
