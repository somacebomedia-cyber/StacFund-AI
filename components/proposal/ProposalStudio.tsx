// components/proposal/ProposalStudio.tsx
/**
 * StacFund — Proposal Studio
 * ==========================
 * The Canva-feel funding-proposal builder. Four steps, never a blank page:
 *
 *   1. TEMPLATE  — gallery of premium templates with live accent previews
 *   2. SETUP     — who / how much / why, prefilled from the user's profile
 *                  and (optionally) a funding opportunity's autofill context
 *   3. OUTLINE   — the AI proposes the section structure; the user edits,
 *                  reorders, drops or adds sections BEFORE long generation
 *   4. EDITOR    — side-panel field editing + live template preview +
 *                  per-section AI rewrite + persistent Download PDF
 *
 * The two-stage pipeline (services/proposal/proposalGenerator.ts) is the
 * presenton/Gamma pattern applied to flowing documents: outline first, then
 * each section is filled by its own focused Gemini call, so any section can
 * be regenerated in seconds without touching the others.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Sparkles, Loader2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Trash2, Plus, RefreshCw, Download, Palette, ZoomIn, ZoomOut, Check,
  ShieldCheck, AlertTriangle, HelpCircle, FileText, Wand2, PenLine, Cloud, FolderOpen,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { loadOpportunities, getOpportunityById } from '../../services/opportunitiesStore';
import { buildAutofillContext, type AutofillContext } from '../../services/autofillContext';
import { exportElementsToPdf } from '../../utils/pdfExporter';
import { exportProposalDocx } from '../../utils/studioDocxExport';
import { handleGeminiError } from '../../services/geminiError';
import { loadBrandKit, type BrandKit } from '../../services/brandKit';
import {
  listSavedProposals, getProposalDoc, deleteProposalDoc, saveProposalDoc,
  newProposalDocId, type SavedDocSummary,
} from '../../services/studioDocs';
import type { User, FundingOpportunityDb } from '../../types';
import {
  type ProposalSection,
  type SectionKind,
  type ProposalDocument,
  type ProposalMeta,
  SECTION_KIND_LABELS,
  createBlankSection,
  createProposalMeta,
} from '../../services/proposal/proposalSchema';
import {
  PROPOSAL_TEMPLATES,
  getProposalTemplate,
  resolveAccent,
} from '../../services/proposal/proposalTemplates';
import {
  generateProposalOutline,
  fillProposalSection,
  buildComplianceSection,
  buildMinimalContextBlock,
} from '../../services/proposal/proposalGenerator';
import {
  ProposalDocumentPages,
  TemplateMiniPreview,
  A4_WIDTH_PX,
} from './ProposalPages';

type Step = 'template' | 'setup' | 'outline' | 'editor';

interface ProposalStudioProps {
  user: User;
  onClose: () => void;
}

function formatRandLabel(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return `R${Number(digits).toLocaleString('en-ZA').replace(/,/g, ' ')}`;
}

const ProposalStudio: React.FC<ProposalStudioProps> = ({ user, onClose }) => {
  // ── Step + design state ──────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('template');
  const [templateId, setTemplateId] = useState('protea');
  const [accentOverride, setAccentOverride] = useState<string | undefined>(undefined);
  const template = useMemo(() => getProposalTemplate(templateId), [templateId]);

  // ── Setup state ──────────────────────────────────────────────────────────
  const [businessName, setBusinessName] = useState(user.businessName || '');
  const [tagline, setTagline] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [preparedFor, setPreparedFor] = useState('');
  const [contactLine, setContactLine] = useState('');
  const [opportunities, setOpportunities] = useState<FundingOpportunityDb[]>([]);
  const [opportunityId, setOpportunityId] = useState<string>('');
  const [ctx, setCtx] = useState<AutofillContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);

  // ── Document state ───────────────────────────────────────────────────────
  const [sections, setSections] = useState<ProposalSection[]>([]);
  const [meta, setMeta] = useState<ProposalMeta>(() => createProposalMeta());

  // ── Persistence + brand state ──────────────────────────────────────────
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [savedProposals, setSavedProposals] = useState<SavedDocSummary[]>([]);
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [savingCloud, setSavingCloud] = useState(false);
  const [docxExporting, setDocxExporting] = useState(false);

  // ── Busy state ───────────────────────────────────────────────────────────
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [fillBusyId, setFillBusyId] = useState<string | null>(null);
  const [fillAllProgress, setFillAllProgress] = useState<{ current: number; total: number } | null>(null);
  const [rewriteInstruction, setRewriteInstruction] = useState('');
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [showCoverEditor, setShowCoverEditor] = useState(false);

  // ── Preview + export ─────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(0.68);
  const previewRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // NOTE: named `proposalDoc` (not `doc`) — the Firestore `doc()` helper is
  // imported at the top and must not be shadowed inside the component.
  const proposalDoc: ProposalDocument = useMemo(
    () => ({ meta, sections, templateId, accentOverride }),
    [meta, sections, templateId, accentOverride]
  );

  // ── Prefill from profile + load opportunities / brand kit / saved docs ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.id));
        if (alive && snap.exists()) {
          const data = snap.data() as any;
          const profile = data.profile ?? {};
          const ownerInfo = data.ownerInfo ?? {};
          setBusinessName((prev) => prev || profile.name || user.businessName || '');
          setContactLine(
            [ownerInfo.name || profile.name || '', profile.whatsapp || profile.email || user.email || '']
              .filter(Boolean)
              .join(' · ')
          );
          setMeta((m) => ({
            ...m,
            businessName: profile.name || user.businessName || m.businessName,
            preparedBy: ownerInfo.name || profile.name || m.preparedBy,
            contactLine: [ownerInfo.name || profile.name || '', profile.whatsapp || profile.email || user.email || '']
              .filter(Boolean)
              .join(' · '),
          }));
        }
      } catch (e) {
        console.warn('[ProposalStudio] profile prefill failed', e);
      }
      try {
        const opps = await loadOpportunities();
        if (alive) setOpportunities(opps);
      } catch (e) {
        console.warn('[ProposalStudio] opportunities load failed', e);
      }
      // Brand kit: default accent + live logo on covers (best-effort).
      loadBrandKit(user.id).then((kit) => {
        if (!alive || !kit) return;
        setBrandKit(kit);
        setAccentOverride((prev) => prev || (kit.accentColor ? kit.accentColor : prev));
        if (kit.tagline) setTagline((prev) => prev || kit.tagline);
      });
      // Saved proposals for the resume list on the template step.
      listSavedProposals(user.id).then((list) => { if (alive) setSavedProposals(list); });
    })();
    return () => { alive = false; };
  }, [user.id, user.businessName, user.email]);

  // ── Autofill context for a chosen opportunity ────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!opportunityId) { setCtx(null); return; }
      setCtxLoading(true);
      try {
        const opp = await getOpportunityById(opportunityId);
        if (!alive || !opp) { setCtx(null); return; }
        const built = await buildAutofillContext(user.id, opp, amount);
        if (!alive) return;
        setCtx(built);
        setPreparedFor(`${opp.issuer_name || 'Funder'} — ${opp.programme_name || 'Funding Programme'}`);
      } catch (e) {
        console.warn('[ProposalStudio] autofill context failed', e);
        setCtx(null);
      } finally {
        if (alive) setCtxLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [opportunityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const genRequest = useMemo(() => {
    const base = {
      businessName: businessName || 'The Business',
      purpose,
      requestedAmountLabel: formatRandLabel(amount),
    };
    return { ...base, contextBlock: ctx?.promptBlock || buildMinimalContextBlock(base) };
  }, [businessName, purpose, amount, ctx]);

  // ── Stage 1: outline ─────────────────────────────────────────────────────
  const runGenerateOutline = async () => {
    setOutlineBusy(true);
    try {
      const outline = await generateProposalOutline(genRequest);
      const withCompliance = ctx ? [...outline, buildComplianceSection(ctx)] : outline;
      setSections(withCompliance);
      setMeta((m) => ({
        ...m,
        businessName: businessName || m.businessName,
        tagline: tagline || `Funding proposal — ${purpose.slice(0, 80) || 'business growth'}`,
        preparedFor: preparedFor || m.preparedFor,
        requestedAmountLabel: formatRandLabel(amount) || m.requestedAmountLabel,
      }));
      setActiveSectionId(withCompliance[0]?.id ?? null);
      setStep('outline');
    } catch (e) {
      handleGeminiError(e);
      setToast('Could not generate the outline. Please try again.');
    } finally {
      setOutlineBusy(false);
    }
  };

  // ── Stage 2: fill ────────────────────────────────────────────────────────
  const runFillSection = async (sectionId: string, instruction?: string) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section || section.deterministic) return;
    setFillBusyId(sectionId);
    try {
      const filled = await fillProposalSection(section, genRequest, instruction);
      setSections((prev) => prev.map((s) => (s.id === sectionId ? filled : s)));
    } catch (e) {
      handleGeminiError(e);
      setToast(`Could not write "${section.title}". Try again or rewrite it manually.`);
    } finally {
      setFillBusyId(null);
    }
  };

  const runFillAll = async () => {
    const pending = sections.filter((s) => s.include && !s.deterministic && s.status === 'outline');
    if (!pending.length) { setStep('editor'); return; }
    setFillAllProgress({ current: 0, total: pending.length });
    let ok = 0;
    for (let i = 0; i < pending.length; i++) {
      setFillAllProgress({ current: i + 1, total: pending.length });
      setFillBusyId(pending[i].id);
      try {
        const filled = await fillProposalSection(pending[i], genRequest);
        setSections((prev) => prev.map((s) => (s.id === pending[i].id ? filled : s)));
        ok++;
      } catch (e) {
        handleGeminiError(e);
      }
    }
    setFillBusyId(null);
    setFillAllProgress(null);
    if (ok < pending.length) setToast(`${pending.length - ok} section(s) failed — you can retry them individually in the editor.`);
    setStep('editor');
  };

  // ── Section ops (outline + editor) ───────────────────────────────────────
  const patchSection = (id: string, patch: Partial<ProposalSection>) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const moveSection = (id: string, dir: -1 | 1) =>
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const target = idx + dir;
      if (idx === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  const addSection = (kind: SectionKind) => {
    const blank = createBlankSection(kind);
    if (kind === 'compliance' && ctx) {
      const built = buildComplianceSection(ctx);
      setSections((prev) => [...prev, built]);
      return;
    }
    setSections((prev) => [...prev, blank]);
    setActiveSectionId(blank.id);
  };

  // ── Cloud persistence (save / resume / delete) ───────────────────────────
  const cloudSave = async (silent = false) => {
    if (!sections.length) return;
    if (!silent) setSavingCloud(true);
    try {
      const id = currentDocId || newProposalDocId();
      if (!currentDocId) setCurrentDocId(id);
      await saveProposalDoc(user.id, id, proposalDoc);
      if (!silent) setToast('Proposal saved to your account.');
      listSavedProposals(user.id).then(setSavedProposals).catch(() => undefined);
    } catch (e) {
      console.warn('[ProposalStudio] cloud save failed', e);
      if (!silent) setToast('Cloud save failed — try again.');
    } finally {
      if (!silent) setSavingCloud(false);
    }
  };

  const openSavedProposal = async (id: string) => {
    setToast('Loading proposal…');
    const loaded = await getProposalDoc(user.id, id);
    if (!loaded) {
      setToast('Could not load that proposal — it may have been deleted.');
      return;
    }
    setCurrentDocId(id);
    setMeta(loaded.meta);
    setSections(loaded.sections);
    setTemplateId(loaded.templateId || 'protea');
    setAccentOverride(loaded.accentOverride);
    setActiveSectionId(loaded.sections[0]?.id ?? null);
    setStep('editor');
  };

  const deleteSavedProposal = async (id: string) => {
    if (!window.confirm('Delete this saved proposal? This cannot be undone.')) return;
    try {
      await deleteProposalDoc(user.id, id);
      setSavedProposals((prev) => prev.filter((p) => p.id !== id));
      if (currentDocId === id) setCurrentDocId(null);
      setToast('Proposal deleted.');
    } catch {
      setToast('Could not delete that proposal — try again.');
    }
  };

  // Autosave 30s after the last edit while in the editor.
  useEffect(() => {
    if (step !== 'editor' || !sections.length) return;
    const t = window.setTimeout(() => { void cloudSave(true); }, 30_000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, proposalDoc]);

  // ── Word export ───────────────────────────────────────────────────────────
  const handleExportDocx = async () => {
    setDocxExporting(true);
    setExportError(null);
    try {
      const filename = `${(meta.businessName || 'Business').replace(/\s+/g, '_')}_Funding_Proposal.docx`;
      const accent = accentOverride || template.accent;
      const brand = {
        businessName: brandKit?.businessName || meta.businessName,
        tagline: brandKit?.tagline || meta.tagline,
        logoDataUrl: brandKit?.logoDataUrl || '',
        logoWidth: brandKit?.logoWidth || 0,
        logoHeight: brandKit?.logoHeight || 0,
        accentColor: accent,
      };
      const result = await exportProposalDocx(proposalDoc, filename, brand);
      if (!result.ok) setExportError(result.error || 'Word export failed. Please try again.');
      else setToast('Word document downloaded — fully editable.');
    } catch (e: any) {
      setExportError(e?.message || 'Word export failed. Please try again.');
    } finally {
      setDocxExporting(false);
    }
  };

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = async () => {
    const container = previewRef.current;
    if (!container) return;
    setExporting(true);
    setExportError(null);
    setExportProgress(null);
    try {
      await new Promise((r) => setTimeout(r, 120));
      const pages = Array.from(container.querySelectorAll('.pdf-page')) as HTMLElement[];
      if (!pages.length) throw new Error('Nothing to export yet.');
      const filename = `${(meta.businessName || 'Business').replace(/\s+/g, '_')}_Funding_Proposal.pdf`;
      const result = await exportElementsToPdf(pages, filename, {
        widthPx: A4_WIDTH_PX,
        widthMm: 210,
        maxHeightMm: 297,
        overflowMode: 'slice',
        backgroundColor: template.palette.page,
        jpegQuality: 0.9,
        onProgress: (current, total) => setExportProgress({ current, total }),
      });
      if (result.failedPages.length) {
        setExportError(`Downloaded, but page(s) ${result.failedPages.join(', ')} couldn't render — try exporting again.`);
      } else {
        setToast('Proposal PDF downloaded.');
      }
    } catch (e) {
      console.error('[ProposalStudio] export failed', e);
      setExportError(e instanceof Error ? e.message : 'Export failed. Please try again.');
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const readiness = useMemo(() => {
    if (!ctx) return null;
    const rules = ctx.eligibility.rules || [];
    const pass = rules.filter((r) => r.verdict === 'pass').length;
    const fail = rules.filter((r) => r.verdict === 'fail').length;
    const unknown = rules.filter((r) => r.verdict === 'unknown').length;
    return { pass, fail, unknown, eligible: ctx.eligibility.eligible };
  }, [ctx]);

  // ── Small shared UI bits ──────────────────────────────────────────────────

  const readinessChip = readiness ? (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
        readiness.fail > 0
          ? 'bg-red-500/15 text-red-300'
          : readiness.unknown > 0
            ? 'bg-amber-500/15 text-amber-300'
            : 'bg-emerald-500/15 text-emerald-300'
      }`}
      title={readiness.fail > 0 ? 'Hard-rule blockers detected' : readiness.unknown > 0 ? 'Some rules need confirmation' : 'All hard rules met'}
    >
      {readiness.fail > 0 ? <AlertTriangle size={13} /> : readiness.unknown > 0 ? <HelpCircle size={13} /> : <ShieldCheck size={13} />}
      {readiness.fail > 0
        ? `${readiness.fail} blocker${readiness.fail > 1 ? 's' : ''}`
        : readiness.unknown > 0
          ? `${readiness.pass} met · ${readiness.unknown} to confirm`
          : `${readiness.pass} rules met`}
    </div>
  ) : null;

  const stepIndex = step === 'template' ? 1 : step === 'setup' ? 2 : step === 'outline' ? 3 : 4;
  const stepLabels = ['Template', 'Details', 'Outline', 'Edit & Export'];

  const stepsBar = (
    <div className="flex items-center gap-2">
      {stepLabels.map((label, i) => {
        const n = i + 1;
        const active = n === stepIndex;
        const done = n < stepIndex;
        return (
          <React.Fragment key={label}>
            {i > 0 && <ChevronRight size={14} className="text-slate-600" />}
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${active ? 'text-white' : done ? 'text-emerald-400' : 'text-slate-500'}`}>
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                  active ? 'bg-emerald-500 text-white' : done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                }`}
              >
                {done ? <Check size={11} /> : n}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );

  const fieldLabel = 'block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5';
  const inputCls =
    'w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 transition';

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <FileText size={16} className="text-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-white leading-tight">Proposal Studio</div>
            <div className="text-[11px] text-slate-400">Premium funding proposals, written with AI</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {stepIndex > 1 && stepIndex < 4 && readinessChip}
          {stepsBar}
          {step === 'editor' && (
            <>
              <button
                onClick={() => void cloudSave(false)}
                disabled={savingCloud}
                className="flex items-center gap-1.5 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 font-semibold text-xs px-3 py-2 rounded-lg transition"
                title="Save to your account"
              >
                {savingCloud ? <Loader2 size={13} className="animate-spin" /> : <Cloud size={13} />}
                <span className="hidden sm:inline">Save</span>
              </button>
              <button
                onClick={handleExportDocx}
                disabled={docxExporting}
                className="flex items-center gap-1.5 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 font-semibold text-xs px-3 py-2 rounded-lg transition"
                title="Download as an editable Word document"
              >
                {docxExporting ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                <span className="hidden sm:inline">Word</span>
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-slate-950 font-bold text-sm px-4 py-2 rounded-lg transition"
              >
                {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {exporting ? 'Rendering…' : 'Download PDF'}
              </button>
            </>
          )}
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition" aria-label="Close">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ═══════════ STEP 1: TEMPLATE GALLERY ═══════════ */}
      {step === 'template' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-10">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-extrabold text-white">Start with a look</h2>
              <p className="text-sm text-slate-400 mt-1.5">Pick a premium template and an accent colour — you can change either at any time.</p>
            </div>

            {savedProposals.length > 0 && (
              <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FolderOpen size={14} className="text-slate-400" />
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Continue a saved proposal</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {savedProposals.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-lg bg-slate-800/50 border border-slate-800 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-slate-200 truncate">{p.title}</div>
                        <div className="text-[11px] text-slate-500">
                          ≈ {p.pagesEst} pages · updated {new Date(p.updatedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                      <button
                        onClick={() => void openSavedProposal(p.id)}
                        className="flex-shrink-0 text-[11px] font-bold text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-md transition"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => void deleteSavedProposal(p.id)}
                        className="flex-shrink-0 p-1.5 text-slate-600 hover:text-red-400 transition"
                        title="Delete proposal"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-6">
              {PROPOSAL_TEMPLATES.map((t) => {
                const selected = t.id === templateId;
                return (
                  <div
                    key={t.id}
                    className={`rounded-2xl p-5 border transition-all cursor-pointer ${
                      selected ? 'border-emerald-500 bg-emerald-500/5 shadow-lg shadow-emerald-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                    }`}
                    onClick={() => { setTemplateId(t.id); setAccentOverride(undefined); }}
                  >
                    <div className="flex justify-center mb-4">
                      <TemplateMiniPreview template={t} accentOverride={selected ? accentOverride : undefined} />
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-white font-bold">{t.name}</div>
                      <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">{t.vibe}</div>
                    </div>
                    <div className="text-xs text-slate-400 mb-4 min-h-[32px]">{t.description}</div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        {t.accentChoices.map((c) => (
                          <button
                            key={c}
                            onClick={(e) => { e.stopPropagation(); setTemplateId(t.id); setAccentOverride(c); }}
                            className={`w-6 h-6 rounded-full border-2 transition ${selected && accentOverride === c ? 'border-white scale-110' : 'border-transparent hover:scale-110'}`}
                            style={{ background: c }}
                            aria-label={`Accent ${c}`}
                          />
                        ))}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setTemplateId(t.id); setStep('setup'); }}
                        className={`text-xs font-bold px-3.5 py-2 rounded-lg transition ${selected ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
                      >
                        Use this template
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ STEP 2: SETUP ═══════════ */}
      {step === 'setup' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8 grid lg:grid-cols-[1fr_420px] gap-10">
            <div>
              <button onClick={() => setStep('template')} className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white mb-5 transition">
                <ChevronLeft size={14} /> Change template
              </button>
              <h2 className="text-xl font-extrabold text-white mb-1">Tell us about the proposal</h2>
              <p className="text-sm text-slate-400 mb-6">We prefill from your profile. Link a funding opportunity and the AI writes to that funder's exact rules.</p>

              <div className="space-y-5">
                <div>
                  <label className={fieldLabel}>Business name</label>
                  <input className={inputCls} value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Lerato Logistics" />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className={fieldLabel}>Funding requested (R)</label>
                    <input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 500000" inputMode="numeric" />
                    {formatRandLabel(amount) && <div className="text-xs text-emerald-400 mt-1.5 font-semibold">{formatRandLabel(amount)}</div>}
                  </div>
                  <div>
                    <label className={fieldLabel}>Prepared for (funder)</label>
                    <input className={inputCls} value={preparedFor} onChange={(e) => setPreparedFor(e.target.value)} placeholder="Auto-filled from the opportunity" />
                  </div>
                </div>
                <div>
                  <label className={fieldLabel}>What is the funding for?</label>
                  <textarea
                    className={`${inputCls} min-h-[96px] resize-y`}
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="e.g. Two delivery vans and working capital to expand our last-mile delivery service into township retail spaza network across KZN"
                  />
                </div>
                <div>
                  <label className={fieldLabel}>Link a funding opportunity (optional, recommended)</label>
                  <select className={inputCls} value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)}>
                    <option value="">General proposal — no specific funder</option>
                    {opportunities.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.issuer_name || 'Funder'} — {o.programme_name || 'Programme'}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2 mt-2 min-h-[24px]">
                    {ctxLoading && <Loader2 size={13} className="animate-spin text-slate-500" />}
                    {!ctxLoading && readinessChip}
                    {!ctxLoading && ctx && ctx.missingDocuments.length > 0 && (
                      <span className="text-[11px] text-slate-500">
                        {ctx.missingDocuments.length} document{ctx.missingDocuments.length > 1 ? 's' : ''} still to upload — the AI will flag them
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-8">
                <button
                  onClick={runGenerateOutline}
                  disabled={outlineBusy || !businessName.trim()}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-bold text-sm px-5 py-3 rounded-xl transition"
                >
                  {outlineBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {outlineBusy ? 'Structuring your proposal…' : 'Generate outline'}
                </button>
                <span className="text-xs text-slate-500">Takes a few seconds · you review the structure before anything long is written</span>
              </div>
            </div>

            {/* Live cover preview while typing */}
            <div className="hidden lg:block">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Live preview</div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                <div style={{ width: 340, overflow: 'hidden', margin: '0 auto' }}>
                  <div style={{ transform: 'scale(0.428)', transformOrigin: 'top left', width: A4_WIDTH_PX }}>
                    <ProposalDocumentPages
                      doc={{ ...proposalDoc, meta: { ...meta, businessName: businessName || meta.businessName, preparedFor: preparedFor || meta.preparedFor, requestedAmountLabel: formatRandLabel(amount) || meta.requestedAmountLabel, tagline: tagline || meta.tagline } }}
                      template={template}
                      hideClosing
                      logoUrl={brandKit?.logoDataUrl || undefined}
                    />
                  </div>
                </div>
                <div className="text-center text-[11px] text-slate-500 mt-4">{template.name} · cover updates as you type</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ STEP 3: OUTLINE REVIEW ═══════════ */}
      {step === 'outline' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8">
            <button onClick={() => setStep('setup')} className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white mb-5 transition">
              <ChevronLeft size={14} /> Back to details
            </button>
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-xl font-extrabold text-white">Review your outline</h2>
                <p className="text-sm text-slate-400 mt-1">The AI proposes the structure — you decide what stays. Nothing long is written until you approve this.</p>
              </div>
              <button onClick={runGenerateOutline} disabled={outlineBusy} className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition">
                <RefreshCw size={13} className={outlineBusy ? 'animate-spin' : ''} /> Re-roll
              </button>
            </div>

            <div className="space-y-2.5 mt-6">
              {sections.map((s, i) => (
                <div
                  key={s.id}
                  className={`rounded-xl border p-4 transition ${s.include ? 'border-slate-700 bg-slate-900/70' : 'border-slate-800 bg-slate-900/40 opacity-55'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-emerald-400 w-6 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                    <input
                      className="flex-1 bg-transparent border-0 text-sm font-bold text-white focus:outline-none focus:ring-0 py-0.5"
                      value={s.title}
                      onChange={(e) => patchSection(s.id, { title: e.target.value })}
                    />
                    {s.deterministic && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0" title="Built from the funder's real rules — not AI-written">
                        Auto-checklist
                      </span>
                    )}
                    <button
                      onClick={() => patchSection(s.id, { include: !s.include })}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${s.include ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}
                      aria-label={s.include ? 'Exclude section' : 'Include section'}
                    >
                      <Check size={14} />
                    </button>
                    <div className="flex flex-col">
                      <button onClick={() => moveSection(s.id, -1)} disabled={i === 0} className="text-slate-500 hover:text-white disabled:opacity-25" aria-label="Move up"><ChevronUp size={14} /></button>
                      <button onClick={() => moveSection(s.id, 1)} disabled={i === sections.length - 1} className="text-slate-500 hover:text-white disabled:opacity-25" aria-label="Move down"><ChevronDown size={14} /></button>
                    </div>
                    <button onClick={() => setSections((prev) => prev.filter((x) => x.id !== s.id))} className="text-slate-500 hover:text-red-400 transition" aria-label="Remove section"><Trash2 size={14} /></button>
                  </div>
                  <div className="pl-9 mt-1.5">
                    <div className="text-xs text-slate-400 leading-relaxed">{s.brief}</div>
                    {s.keyPoints.length > 0 && (
                      <div className="text-[11px] text-slate-500 mt-1">{s.keyPoints.length} key point{s.keyPoints.length > 1 ? 's' : ''} to cover</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-5">
              <select
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                defaultValue=""
                onChange={(e) => { if (e.target.value) { addSection(e.target.value as SectionKind); e.target.value = ''; } }}
              >
                <option value="">+ Add a section…</option>
                {(Object.keys(SECTION_KIND_LABELS) as SectionKind[])
                  .filter((k) => k !== 'custom')
                  .map((k) => (
                    <option key={k} value={k}>{SECTION_KIND_LABELS[k]}</option>
                  ))}
              </select>
            </div>

            <div className="flex items-center gap-3 mt-8 pb-6">
              <button
                onClick={runFillAll}
                disabled={fillAllProgress !== null}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-slate-950 font-bold text-sm px-5 py-3 rounded-xl transition"
              >
                {fillAllProgress ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                {fillAllProgress
                  ? `Writing section ${fillAllProgress.current} of ${fillAllProgress.total}…`
                  : `Write all sections (${sections.filter((s) => s.include && !s.deterministic && s.status === 'outline').length})`}
              </button>
              <button onClick={() => setStep('editor')} className="text-xs font-semibold text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition">
                Skip to editor →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ STEP 4: EDITOR ═══════════ */}
      {step === 'editor' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-slate-800 bg-slate-900/60 overflow-x-auto">
            <div className="flex items-center gap-2">
              <Palette size={14} className="text-slate-500 shrink-0" />
              {PROPOSAL_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setTemplateId(t.id); setAccentOverride(undefined); }}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition shrink-0 ${t.id === templateId ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                >
                  {t.name}
                </button>
              ))}
              <div className="w-px h-5 bg-slate-700 mx-1 shrink-0" />
              {template.accentChoices.map((c) => (
                <button
                  key={c}
                  onClick={() => setAccentOverride(c === template.palette.accent ? undefined : c)}
                  className={`w-6 h-6 rounded-full border-2 transition shrink-0 ${resolveAccent(template, accentOverride) === c ? 'border-white scale-110' : 'border-transparent hover:scale-110'}`}
                  style={{ background: c }}
                  aria-label={`Accent ${c}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {readinessChip}
              <button onClick={() => setShowCoverEditor((v) => !v)} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${showCoverEditor ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                <PenLine size={13} /> Cover details
              </button>
              <div className="w-px h-5 bg-slate-700" />
              <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.08).toFixed(2)))} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg" aria-label="Zoom out"><ZoomOut size={15} /></button>
              <span className="text-[11px] text-slate-500 w-9 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(1.2, +(z + 0.08).toFixed(2)))} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg" aria-label="Zoom in"><ZoomIn size={15} /></button>
            </div>
          </div>

          {/* Cover details drawer */}
          {showCoverEditor && (
            <div className="px-4 py-4 border-b border-slate-800 bg-slate-900/90 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {([
                ['Business name', 'businessName', meta.businessName],
                ['Tagline', 'tagline', meta.tagline],
                ['Prepared for', 'preparedFor', meta.preparedFor],
                ['Prepared by', 'preparedBy', meta.preparedBy],
                ['Amount label', 'requestedAmountLabel', meta.requestedAmountLabel],
                ['Contact line', 'contactLine', meta.contactLine],
              ] as const).map(([label, key, value]) => (
                <div key={key}>
                  <label className={fieldLabel}>{label}</label>
                  <input className={inputCls} value={value} onChange={(e) => setMeta((m) => ({ ...m, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
          )}

          {/* Body: side panel + live preview */}
          <div className="flex-1 flex overflow-hidden">
            {/* Side panel */}
            <div className="w-[390px] shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-900/50">
              {sections.filter((s) => s.include).length === 0 && (
                <div className="p-6 text-sm text-slate-500 text-center">All sections excluded. Include at least one section to build a proposal.</div>
              )}
              {sections.map((s) => {
                const active = activeSectionId === s.id;
                const pendingFill = s.status === 'outline' && !s.deterministic;
                const busy = fillBusyId === s.id;
                return (
                  <div key={s.id} className={`border-b border-slate-800/70 ${active ? 'bg-slate-900' : ''}`}>
                    <button
                      onClick={() => { setActiveSectionId(active ? null : s.id); setRewriteInstruction(''); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-slate-800/50 transition"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${busy ? 'bg-amber-400 animate-pulse' : s.deterministic ? 'bg-emerald-500' : pendingFill ? 'bg-slate-500' : 'bg-emerald-500'}`} />
                      <span className="text-sm font-bold text-white truncate flex-1">{s.title}</span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-500 shrink-0">{SECTION_KIND_LABELS[s.kind]}</span>
                      <ChevronDown size={14} className={`text-slate-500 transition-transform shrink-0 ${active ? 'rotate-180' : ''}`} />
                    </button>

                    {active && (
                      <div className="px-4 pb-5 space-y-4">
                        <input
                          className={inputCls}
                          value={s.title}
                          onChange={(e) => patchSection(s.id, { title: e.target.value })}
                          placeholder="Section title"
                        />

                        {!s.deterministic && (
                          <div className="bg-slate-950/60 rounded-lg p-3 border border-slate-800">
                            <div className="text-[11px] text-slate-500 leading-relaxed mb-2">
                              <span className="font-bold text-slate-400">Brief:</span> {s.brief}
                            </div>
                            {s.keyPoints.length > 0 && (
                              <ul className="text-[11px] text-slate-500 space-y-1">
                                {s.keyPoints.map((kp, i) => (
                                  <li key={i} className="flex gap-1.5"><span className="text-emerald-500">•</span>{kp}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        {/* Paragraphs */}
                        {s.paragraphs.map((para, pi) => (
                          <div key={pi} className="relative group">
                            <textarea
                              className={`${inputCls} resize-y text-[13px] leading-relaxed`}
                              rows={Math.max(3, Math.ceil(para.length / 80))}
                              value={para}
                              onChange={(e) => {
                                const next = [...s.paragraphs];
                                next[pi] = e.target.value;
                                patchSection(s.id, { paragraphs: next });
                              }}
                            />
                            <button
                              onClick={() => patchSection(s.id, { paragraphs: s.paragraphs.filter((_, x) => x !== pi) })}
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition"
                              aria-label="Remove paragraph"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                        {s.status === 'filled' && (
                          <button
                            onClick={() => patchSection(s.id, { paragraphs: [...s.paragraphs, ''] })}
                            className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-emerald-400 transition"
                          >
                            <Plus size={12} /> Add paragraph
                          </button>
                        )}

                        {/* Bullets */}
                        {s.bullets.map((b, bi) => (
                          <div key={bi} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            <input
                              className={`${inputCls} text-[13px] py-2`}
                              value={b}
                              onChange={(e) => {
                                const next = [...s.bullets];
                                next[bi] = e.target.value;
                                patchSection(s.id, { bullets: next });
                              }}
                            />
                            <button onClick={() => patchSection(s.id, { bullets: s.bullets.filter((_, x) => x !== bi) })} className="text-slate-600 hover:text-red-400 shrink-0 transition" aria-label="Remove bullet"><Trash2 size={12} /></button>
                          </div>
                        ))}
                        {s.status === 'filled' && (
                          <button
                            onClick={() => patchSection(s.id, { bullets: [...s.bullets, ''] })}
                            className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-emerald-400 transition"
                          >
                            <Plus size={12} /> Add bullet
                          </button>
                        )}

                        {/* Stats */}
                        {s.stats.length > 0 && (
                          <div className="space-y-2">
                            {s.stats.map((st, si) => (
                              <div key={si} className="flex items-center gap-2">
                                <input
                                  className={`${inputCls} w-24 text-[13px] py-2 font-bold text-center`}
                                  value={st.value}
                                  onChange={(e) => {
                                    const next = [...s.stats];
                                    next[si] = { ...st, value: e.target.value };
                                    patchSection(s.id, { stats: next });
                                  }}
                                />
                                <input
                                  className={`${inputCls} flex-1 text-[13px] py-2`}
                                  value={st.label}
                                  onChange={(e) => {
                                    const next = [...s.stats];
                                    next[si] = { ...st, label: e.target.value };
                                    patchSection(s.id, { stats: next });
                                  }}
                                />
                                <button onClick={() => patchSection(s.id, { stats: s.stats.filter((_, x) => x !== si) })} className="text-slate-600 hover:text-red-400 shrink-0 transition" aria-label="Remove stat"><Trash2 size={12} /></button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Table */}
                        {s.table && (
                          <div className="rounded-lg border border-slate-800 overflow-hidden">
                            <div className="flex bg-slate-950/80 px-2 py-1.5 gap-2">
                              {s.table.columns.map((c, ci) => (
                                <input
                                  key={ci}
                                  className="flex-1 min-w-0 bg-transparent text-[11px] font-bold uppercase tracking-wide text-slate-400 focus:outline-none"
                                  value={c}
                                  onChange={(e) => {
                                    const columns = [...s.table!.columns];
                                    columns[ci] = e.target.value;
                                    patchSection(s.id, { table: { ...s.table!, columns } });
                                  }}
                                />
                              ))}
                            </div>
                            {s.table.rows.map((row, ri) => (
                              <div key={ri} className="flex px-2 py-1 gap-2 border-t border-slate-800 items-center">
                                {row.map((cell, ci) => (
                                  <input
                                    key={ci}
                                    className="flex-1 min-w-0 bg-transparent text-[12px] text-white focus:outline-none focus:bg-slate-800 rounded px-1 py-0.5"
                                    value={cell}
                                    onChange={(e) => {
                                      const rows = s.table!.rows.map((r) => [...r]);
                                      rows[ri][ci] = e.target.value;
                                      patchSection(s.id, { table: { ...s.table!, rows } });
                                    }}
                                  />
                                ))}
                                <button onClick={() => patchSection(s.id, { table: { ...s.table!, rows: s.table!.rows.filter((_, x) => x !== ri) } })} className="text-slate-600 hover:text-red-400 shrink-0 transition" aria-label="Remove row"><Trash2 size={11} /></button>
                              </div>
                            ))}
                            <button
                              onClick={() => patchSection(s.id, { table: { ...s.table!, rows: [...s.table!.rows, s.table!.columns.map(() => '')] } })}
                              className="w-full flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-emerald-400 py-1.5 hover:bg-slate-800/50 transition"
                            >
                              <Plus size={11} /> Add row
                            </button>
                          </div>
                        )}

                        {/* AI actions */}
                        {!s.deterministic && (
                          <div className="pt-1 space-y-2">
                            <div className="flex gap-2">
                              <input
                                className={`${inputCls} text-[12px] py-2`}
                                value={rewriteInstruction}
                                onChange={(e) => setRewriteInstruction(e.target.value)}
                                placeholder="Optional: e.g. make it more conservative"
                              />
                              <button
                                onClick={() => runFillSection(s.id, rewriteInstruction.trim() || undefined)}
                                disabled={busy}
                                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-bold px-3 rounded-lg transition shrink-0"
                              >
                                {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                {pendingFill ? 'Write' : 'Rewrite'}
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => moveSection(s.id, -1)} className="text-slate-500 hover:text-white transition" aria-label="Move up"><ChevronUp size={14} /></button>
                              <button onClick={() => moveSection(s.id, 1)} className="text-slate-500 hover:text-white transition" aria-label="Move down"><ChevronDown size={14} /></button>
                              <button onClick={() => patchSection(s.id, { include: false })} className="text-slate-500 hover:text-white text-[11px] font-semibold transition">Exclude from document</button>
                              <button onClick={() => setSections((prev) => prev.filter((x) => x.id !== s.id))} className="ml-auto text-slate-600 hover:text-red-400 transition" aria-label="Delete section"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="p-3">
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) { addSection(e.target.value as SectionKind); e.target.value = ''; } }}
                >
                  <option value="">+ Add a section…</option>
                  {(Object.keys(SECTION_KIND_LABELS) as SectionKind[])
                    .filter((k) => k !== 'custom')
                    .map((k) => (
                      <option key={k} value={k}>{SECTION_KIND_LABELS[k]}</option>
                    ))}
                </select>
              </div>
            </div>

            {/* Live preview */}
            <div className="flex-1 overflow-auto bg-slate-800/40 p-8" ref={previewRef}>
              <div style={{ width: A4_WIDTH_PX * zoom, margin: '0 auto' }}>
                <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                  <ProposalDocumentPages doc={proposalDoc} template={template} logoUrl={brandKit?.logoDataUrl || undefined} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export overlay */}
      {exporting && (
        <div className="absolute inset-0 z-[210] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 text-center max-w-xs w-full">
            <Loader2 size={28} className="animate-spin text-emerald-400 mx-auto mb-4" />
            <div className="text-white font-bold text-sm mb-1">Rendering your PDF</div>
            {exportProgress ? (
              <div className="text-xs text-slate-400">Page {exportProgress.current} of {exportProgress.total}</div>
            ) : (
              <div className="text-xs text-slate-400">Preparing pages…</div>
            )}
          </div>
        </div>
      )}

      {/* Error / toast */}
      {exportError && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[220] flex items-center gap-2 bg-red-950/95 border border-red-800 text-red-200 text-xs font-semibold px-4 py-3 rounded-xl shadow-xl max-w-md">
          <AlertTriangle size={14} className="shrink-0" />
          {exportError}
          <button onClick={() => setExportError(null)} className="ml-2 text-red-400 hover:text-white"><X size={13} /></button>
        </div>
      )}
      {toast && !exportError && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[220] flex items-center gap-2 bg-emerald-950/95 border border-emerald-800 text-emerald-200 text-xs font-semibold px-4 py-3 rounded-xl shadow-xl">
          <Check size={14} />
          {toast}
        </div>
      )}
    </div>
  );
};

export default ProposalStudio;
