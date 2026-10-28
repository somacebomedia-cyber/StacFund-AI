// components/businessPlan/BusinessPlanStudio.tsx
/**
 * StacFund — Business Plan Studio (long-form, Venturekit-class)
 * ==============================================================
 * The full 70–120 page funder-ready business plan builder.
 *
 *   SETUP       — who / how much / which funder, with the depth engine's
 *                 live verdict ("≈ 92 pages") before anything is generated
 *   OUTLINE     — review the chapter structure; drop or add sections
 *   WRITING     — section-by-section generation with live progress,
 *                 checkpointed after every section (resumable)
 *   EDITOR      — chapter tree + paginated WYSIWYG preview + per-block
 *                 editing + AI rewrite + text-PDF download
 *
 * The deepen loop and the 120-page ceiling are enforced automatically in
 * the editor step.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Sparkles, Loader2, ChevronLeft, ChevronDown, Download, ZoomIn, ZoomOut,
  BookOpen, Check, AlertTriangle, RefreshCw, Plus, Trash2, FileText, Cloud, PenLine,
} from 'lucide-react';
import { doc as fsDoc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { loadOpportunities, getOpportunityById } from '../../services/opportunitiesStore';
import { buildAutofillContext, type AutofillContext } from '../../services/autofillContext';
import { handleGeminiError } from '../../services/geminiError';
import { getQuotaInfo, recordAiQueryUsage } from '../../services/tokenQuotaService';
import type { User, FundingOpportunityDb } from '../../types';
import {
  type PlanDocument, type PlanMeta, type PlanSubsection, type PlanBlock,
  createPlanMeta, newId, documentWordCount, subsectionWordCount,
} from '../../services/businessPlan/planSchema';
import { computeDepth, classifyFunder, type DepthOverride, type DepthProfile } from '../../services/businessPlan/planDepth';
import { CHAPTER_CATALOG, type SubsectionTemplate } from '../../services/businessPlan/planStructure';
import {
  generatePlanTailoring, buildPlanSkeleton, fillPlanSubsection, extractKeyClaims,
  buildMinimalPlanContext, savePlanCheckpoint, loadPlanCheckpoint, clearPlanCheckpoint,
  estimatePlanTokens, type PlanGenRequest, type PlanCheckpoint,
} from '../../services/businessPlan/planGenerator';
import {
  loadFundingNeeds, summarizeFundingNeeds, toPanelInfo, fundingClaimsFromSummary,
  formatRandAmount, type FundingNeedItem, type FundingNeedsSummary,
} from '../../services/businessPlan/planFinancials';
import { loadBrandKit, type BrandKit } from '../../services/brandKit';
import {
  listSavedPlans, getPlanDoc, deletePlanDoc, savePlanDoc, type SavedDocSummary,
} from '../../services/studioDocs';
import { paginatePlan, type PaginatedPlan, PAGE_W, PAGE_H } from './planPaginate';
import {
  getPlanTheme, makePlanThemeFromAccent, PlanMeasureLayer, PlanCoverPage, PlanTocPage, PlanChapterOpener, PlanContentPage,
} from './PlanBlocks';
import { exportPlanToPdf } from '../../utils/planPdfExport';
import { exportPlanDocx } from '../../utils/studioDocxExport';
import PlanSetupPanel, { type PlanSetupState } from './PlanSetupPanel';
import PlanEditorPanel from './PlanEditorPanel';

type Step = 'setup' | 'outline' | 'generating' | 'editor';

export interface PlanPrefill {
  opportunityId?: string;
  amount?: string;
  purpose?: string;
  businessName?: string;
}

interface Props {
  user: User;
  onClose: () => void;
  prefill?: PlanPrefill;
}

function fmtRand(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return `R${Number(digits).toLocaleString('en-ZA').replace(/,/g, ' ')}`;
}
function parseRand(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}
function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type Chapter = PlanDocument['chapters'][number];

function findSub(d: PlanDocument, subId: string): { chapter: Chapter; sub: PlanSubsection } | null {
  for (const c of d.chapters) {
    const s = c.subsections.find((x) => x.id === subId);
    if (s) return { chapter: c, sub: s };
  }
  return null;
}
function replaceSubsection(d: PlanDocument, sub: PlanSubsection): PlanDocument {
  return {
    ...d, updatedAt: Date.now(),
    chapters: d.chapters.map((c) => (c.subsections.some((s) => s.id === sub.id)
      ? { ...c, subsections: c.subsections.map((s) => (s.id === sub.id ? sub : s)) }
      : c)),
  };
}
function addSubsection(d: PlanDocument, chapterId: string, sub: PlanSubsection): PlanDocument {
  return {
    ...d, updatedAt: Date.now(),
    chapters: d.chapters.map((c) => (c.id === chapterId ? { ...c, subsections: [...c.subsections, sub] } : c)),
  };
}
function removeSubsection(d: PlanDocument, subId: string): PlanDocument {
  return {
    ...d, updatedAt: Date.now(),
    chapters: d.chapters.map((c) => ({ ...c, subsections: c.subsections.filter((s) => s.id !== subId) })),
  };
}
function isRequiredSub(chapterId: string, poolId?: string): boolean {
  if (!poolId) return false;
  if (poolId === 'document_checklist') return true;
  const tpl = CHAPTER_CATALOG.find((c) => c.id === chapterId);
  return !!tpl?.required.some((s) => s.poolId === poolId);
}

const BusinessPlanStudio: React.FC<Props> = ({ user, onClose, prefill }) => {
  const [step, setStep] = useState<Step>('setup');

  // ── Setup state ──────────────────────────────────────────────────────────
  const [setup, setSetup] = useState<PlanSetupState>({
    businessName: prefill?.businessName || user.businessName || '',
    tagline: '', preparedBy: '', contactEmail: user.email || '', contactPhone: '',
    contactWebsite: '', contactAddress: '', amount: prefill?.amount || '',
    purpose: prefill?.purpose || '', preparedFor: '', opportunityId: prefill?.opportunityId || '',
    themeId: 'navy', depthOverride: 'auto',
  });
  const patchSetup = (p: Partial<PlanSetupState>) => setSetup((s) => ({ ...s, ...p }));
  const [opportunities, setOpportunities] = useState<FundingOpportunityDb[]>([]);
  const [ctx, setCtx] = useState<AutofillContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [resumeCp, setResumeCp] = useState<PlanCheckpoint | null>(null);

  // ── Real-data sources: funding needs, brand kit, saved plans ────────────
  const [fundingNeedsItems, setFundingNeedsItems] = useState<FundingNeedItem[]>([]);
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [savedPlans, setSavedPlans] = useState<SavedDocSummary[]>([]);
  const fundingClaimsRef = useRef<string[]>([]);

  // ── Document + generation ────────────────────────────────────────────────
  const [doc, setDoc] = useState<PlanDocument | null>(null);
  const docRef = useRef<PlanDocument | null>(null);
  const genReqRef = useRef<PlanGenRequest | null>(null);
  const keyClaimsRef = useRef<string[]>([]);
  const abortRef = useRef(false);
  const genRunningRef = useRef(false);
  const [genDone, setGenDone] = useState(0);
  const [genTotal, setGenTotal] = useState(0);
  const [genCurrent, setGenCurrent] = useState('');
  const [genElapsed, setGenElapsed] = useState(0);
  const [genFailCount, setGenFailCount] = useState(0);

  // ── Editor state ─────────────────────────────────────────────────────────
  const [paginated, setPaginated] = useState<PaginatedPlan | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(0.62);
  const previewRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<{ kind: 'meta' } | { kind: 'sub'; id: string }>({ kind: 'meta' });
  const [rewriteBusyId, setRewriteBusyId] = useState<string | null>(null);
  const [deepenBusy, setDeepenBusy] = useState(false);
  const [deepenNote, setDeepenNote] = useState<string | null>(null);
  const deepenBusyRef = useRef(false);
  const deepenRoundsRef = useRef(0);
  const [addMenuFor, setAddMenuFor] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [savingCloud, setSavingCloud] = useState(false);
  const [docxExporting, setDocxExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const theme = useMemo(() => {
    const id = doc?.accentOverride || setup.themeId;
    if (id === 'brand' && brandKit?.accentColor) return makePlanThemeFromAccent(brandKit.accentColor);
    return getPlanTheme(id);
  }, [doc?.accentOverride, setup.themeId, brandKit]);

  // ── Depth engine verdict (live) ──────────────────────────────────────────
  const depth: DepthProfile = useMemo(() => {
    const issuer = ctx?.opportunity?.issuer_name || setup.preparedFor || '';
    const ftype = ctx?.opportunity?.funding_type || '';
    const cls = classifyFunder(issuer, ftype);
    const d = computeDepth(
      { category: cls.category, amountRand: parseRand(setup.amount), override: setup.depthOverride },
      CHAPTER_CATALOG.length
    );
    return { ...d, categoryLabel: cls.label };
  }, [ctx, setup.preparedFor, setup.amount, setup.depthOverride]);

  // ── Funding-needs summary (real figures for the Financial Plan) ─────────
  const fundingNeedsSummary: FundingNeedsSummary = useMemo(
    () => summarizeFundingNeeds(fundingNeedsItems, parseRand(setup.amount)),
    [fundingNeedsItems, setup.amount]
  );

  const quota = useMemo(() => {
    try {
      const info = getQuotaInfo(user.id, user.subscriptionPlan);
      return info ? { used: info.used, limit: info.limit } : null;
    } catch { return null; }
  }, [user.id, user.subscriptionPlan]);

  const estTokens = useMemo(() => estimatePlanTokens(depth.targetWords), [depth.targetWords]);

  // ── Prefill + opportunities + real-data sources ──────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(fsDoc(db, 'users', user.id));
        if (alive && snap.exists()) {
          const data = snap.data() as any;
          const profile = data.profile ?? {};
          const ownerInfo = data.ownerInfo ?? {};
          setSetup((s) => ({
            ...s,
            businessName: s.businessName || profile.name || user.businessName || '',
            preparedBy: ownerInfo.name || profile.name || s.preparedBy,
            contactEmail: profile.email || user.email || s.contactEmail,
            contactPhone: profile.whatsapp || ownerInfo.whatsapp || s.contactPhone,
            contactWebsite: profile.website || s.contactWebsite,
            contactAddress: profile.address || s.contactAddress,
          }));
        }
      } catch (e) { console.warn('[PlanStudio] profile prefill failed', e); }
      try {
        const opps = await loadOpportunities();
        if (alive) setOpportunities(opps);
      } catch (e) { console.warn('[PlanStudio] opportunities load failed', e); }

      // Real-data sources: funding-needs register, brand kit, saved plans.
      // All best-effort — the studio works without them.
      loadFundingNeeds(user.id).then((items) => { if (alive) setFundingNeedsItems(items); });
      loadBrandKit(user.id).then((kit) => { if (alive) setBrandKit(kit); });
      listSavedPlans(user.id).then((plans) => { if (alive) setSavedPlans(plans); });

      // Local in-progress checkpoint (interrupted generation) → resume banner.
      const local = loadPlanCheckpoint();
      if (local?.doc?.chapters?.length && alive) setResumeCp(local);
    })();
    return () => { alive = false; };
  }, [user.id, user.businessName, user.email]);

  // Brand-kit prefill: tagline / trading name when the user has not typed one.
  useEffect(() => {
    if (!brandKit) return;
    setSetup((s) => ({
      ...s,
      businessName: s.businessName || brandKit.businessName || '',
      tagline: s.tagline || brandKit.tagline || '',
    }));
  }, [brandKit]);

  // ── Autofill context for the chosen opportunity ──────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!setup.opportunityId) { setCtx(null); return; }
      setCtxLoading(true);
      try {
        const opp = await getOpportunityById(setup.opportunityId);
        if (!alive || !opp) { setCtx(null); return; }
        const built = await buildAutofillContext(user.id, opp, setup.amount);
        if (!alive) return;
        setCtx(built);
        patchSetup({ preparedFor: `${opp.issuer_name || 'Funder'} — ${opp.programme_name || 'Funding Programme'}` });
      } catch (e) {
        console.warn('[PlanStudio] autofill context failed', e);
        setCtx(null);
      } finally {
        if (alive) setCtxLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [setup.opportunityId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Request builders ─────────────────────────────────────────────────────
  function buildReqFromFields(): PlanGenRequest {
    const base = {
      businessName: setup.businessName || 'The Business',
      purpose: setup.purpose,
      requestedAmountLabel: fmtRand(setup.amount),
      requestedAmountRand: parseRand(setup.amount),
    };
    return {
      ...base,
      contextBlock: ctx?.promptBlock || buildMinimalPlanContext(base),
      fundingNeedsSummary: fundingNeedsSummary.count ? fundingNeedsSummary : null,
    };
  }
  const getReq = (): PlanGenRequest | null => genReqRef.current;

  // ── Stage 0.5 + 0: outline ───────────────────────────────────────────────
  const startOutline = async () => {
    setOutlineBusy(true);
    try {
      const req = buildReqFromFields();
      genReqRef.current = req;
      // Seed the consistency tracker with the REAL funding-needs figures so
      // every one of the ~50 later sections stays numerically consistent.
      fundingClaimsRef.current = req.fundingNeedsSummary
        ? fundingClaimsFromSummary(req.fundingNeedsSummary, req.requestedAmountLabel)
        : [];
      const tailoring = await generatePlanTailoring(req, depth);
      const meta: PlanMeta = createPlanMeta({
        businessName: setup.businessName,
        tagline: setup.tagline || (setup.purpose ? setup.purpose.slice(0, 110) : ''),
        planTitle: 'Business Plan',
        preparedFor: setup.preparedFor || 'The Review Committee',
        preparedBy: setup.preparedBy,
        contactEmail: setup.contactEmail,
        contactPhone: setup.contactPhone,
        contactWebsite: setup.contactWebsite,
        contactAddress: setup.contactAddress,
        requestedAmountLabel: fmtRand(setup.amount),
      });
      const skeleton = buildPlanSkeleton(req, depth, tailoring, meta, ctx);
      skeleton.accentOverride = setup.themeId;
      docRef.current = skeleton;
      setDoc(skeleton);
      savePlanCheckpoint(skeleton, req);
      setResumeCp(null);
      setStep('outline');
    } catch (e) {
      handleGeminiError(e);
      setToast('Could not structure the plan. Please try again.');
    } finally {
      setOutlineBusy(false);
    }
  };

  // ── Stage 1: generation ──────────────────────────────────────────────────
  async function runGenerationLoop() {
    const startDoc = docRef.current;
    const req = getReq();
    if (!startDoc || !req) return;
    genRunningRef.current = true;
    abortRef.current = false;
    setStep('generating');
    setGenFailCount(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => setGenElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    try {
      let current = startDoc;
      const queue: { subId: string; chapterId: string; title: string }[] = [];
      for (const c of current.chapters) {
        for (const s of c.subsections) {
          if (!s.deterministic && s.status !== 'filled') queue.push({ subId: s.id, chapterId: c.id, title: s.title });
        }
      }
      setGenTotal(queue.length);
      setGenDone(0);
      let fails = 0;

      for (let i = 0; i < queue.length; i++) {
        if (abortRef.current) break;
        const item = queue[i];
        setGenCurrent(item.title);
        const chapter = current.chapters.find((c) => c.id === item.chapterId)!;
        const sub = chapter.subsections.find((s) => s.id === item.subId)!;
        try {
          const written = chapter.subsections.filter((s) => s.status === 'filled').map((s) => s.title);
          const filled = await fillPlanSubsection(sub, chapter, req, {
            writtenSiblingTitles: written,
            keyClaims: keyClaimsRef.current,
          });
          current = replaceSubsection(current, filled);
          docRef.current = current;
          setDoc(current);
          savePlanCheckpoint(current, req);
          recordAiQueryUsage(user.id, user.subscriptionPlan || 'free');
          if (chapter.id === 'executive_summary') {
            keyClaimsRef.current = [...fundingClaimsRef.current, ...extractKeyClaims(current)];
          }
        } catch (e: any) {
          console.warn('[PlanStudio] fill failed:', item.title, e?.message);
          fails++;
          setGenFailCount(fails);
          current = replaceSubsection(current, { ...sub, status: 'failed' });
          docRef.current = current;
          setDoc(current);
        }
        setGenDone(i + 1);
      }
      setGenCurrent('');
    } finally {
      window.clearInterval(timer);
      genRunningRef.current = false;
      setStep('editor');
    }
  }

  const continueOrStartWriting = () => void runGenerationLoop();

  // ── Deepen (auto-expand to reach the page floor) ─────────────────────────
  useEffect(() => {
    if (step !== 'editor' || !doc || !paginated) return;
    if (genRunningRef.current || deepenBusyRef.current) return;
    if (deepenRoundsRef.current >= 3) return;
    if (paginated.totalPages >= doc.depth.minPages) return;
    void runDeepen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, paginated]);

  async function runDeepen() {
    const d = docRef.current;
    const req = getReq();
    if (!d || !req) return;
    deepenBusyRef.current = true;
    setDeepenBusy(true);
    try {
      const totalNow = paginated?.totalPages ?? d.depth.targetPages;
      const deficitPages = d.depth.minPages - totalNow;
      if (deficitPages <= 0) { deepenRoundsRef.current += 1; return; }

      const candidates: { chapterId: string; item: SubsectionTemplate }[] = [];
      for (const tpl of CHAPTER_CATALOG) {
        const ch = d.chapters.find((c) => c.id === tpl.id);
        if (!ch) continue;
        const used = new Set(ch.subsections.map((s) => s.poolId));
        for (const item of tpl.pool) if (!used.has(item.poolId)) candidates.push({ chapterId: tpl.id, item });
      }
      if (!candidates.length) { deepenRoundsRef.current += 1; setDeepenNote(null); return; }

      const takeCount = Math.max(1, Math.min(candidates.length, Math.ceil((deficitPages * 340) / 820)));
      setDeepenNote(`Expanding to reach your ${d.depth.minPages}-page target — writing ${takeCount} more section${takeCount > 1 ? 's' : ''}…`);

      let current = d;
      for (const cand of candidates.slice(0, takeCount)) {
        if (abortRef.current) break;
        const chapter = current.chapters.find((c) => c.id === cand.chapterId)!;
        const sub: PlanSubsection = {
          id: newId('sub'), title: cand.item.title, brief: cand.item.brief, recipe: cand.item.recipe,
          targetWords: 850, status: 'outline', blocks: [], optional: true, poolId: cand.item.poolId,
        };
        try {
          const filled = await fillPlanSubsection(sub, chapter, req, { keyClaims: keyClaimsRef.current });
          current = addSubsection(current, cand.chapterId, filled);
          docRef.current = current;
          setDoc(current);
          savePlanCheckpoint(current, req);
          recordAiQueryUsage(user.id, user.subscriptionPlan || 'free');
        } catch (e) {
          console.warn('[PlanStudio] deepen fill failed:', cand.item.title, e);
        }
      }
      deepenRoundsRef.current += 1;
    } finally {
      deepenBusyRef.current = false;
      setDeepenBusy(false);
      setDeepenNote(null);
    }
  }

  // ── Trim (auto-drop optionals past the 120-page ceiling) ─────────────────
  useEffect(() => {
    if (step !== 'editor' || !doc || !paginated) return;
    if (genRunningRef.current || deepenBusyRef.current) return;
    if (paginated.totalPages <= doc.depth.maxPages) return;
    let current = docRef.current!;
    let pages = paginated.totalPages;
    const dropped: string[] = [];
    while (pages > current.depth.maxPages) {
      let found: { subId: string; title: string } | null = null;
      outer: for (let ci = current.chapters.length - 1; ci >= 0; ci--) {
        for (let si = current.chapters[ci].subsections.length - 1; si >= 0; si--) {
          const s = current.chapters[ci].subsections[si];
          if (s.optional && !s.deterministic && s.status === 'filled') { found = { subId: s.id, title: s.title }; break outer; }
        }
      }
      if (!found) break;
      current = removeSubsection(current, found.subId);
      dropped.push(found.title);
      pages -= 2;
    }
    if (dropped.length) {
      docRef.current = current;
      setDoc(current);
      savePlanCheckpoint(current, getReq()!);
      setToast(`Trimmed to stay within ${current.depth.maxPages} pages — removed ${dropped.length} optional section${dropped.length > 1 ? 's' : ''}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, paginated]);

  // ── Pagination (measure → paginate) ──────────────────────────────────────
  const fontsReadyRef = useRef<Promise<void> | null>(null);
  function fontsReady(): Promise<void> {
    if (!fontsReadyRef.current) {
      const anyDoc = document as Document & { fonts?: { ready: Promise<unknown> } };
      fontsReadyRef.current = anyDoc.fonts ? anyDoc.fonts.ready.then(() => undefined) : Promise.resolve();
    }
    return fontsReadyRef.current;
  }

  useEffect(() => {
    if (!doc) { setPaginated(null); return; }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try { await fontsReady(); } catch { /* ignore */ }
      if (cancelled) return;
      const el = measureRef.current;
      if (!el) return;
      const map = new Map<string, number>();
      el.querySelectorAll<HTMLElement>('[data-mid]').forEach((node) => {
        const id = node.dataset.mid;
        if (id) map.set(id, node.getBoundingClientRect().height);
      });
      try {
        const result = paginatePlan(doc, (b) => map.get(b.id) ?? 90);
        if (!cancelled) setPaginated(result);
      } catch (e) {
        console.warn('[PlanStudio] pagination failed', e);
      }
    }, 420);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [doc]);

  // ── Editor mutations ─────────────────────────────────────────────────────
  const patchMeta = (patch: Partial<PlanMeta>) => {
    if (!docRef.current) return;
    const next = { ...docRef.current, meta: { ...docRef.current.meta, ...patch }, updatedAt: Date.now() };
    docRef.current = next; setDoc(next);
  };
  const patchSubsection = (id: string, patch: Partial<PlanSubsection>) => {
    const f = docRef.current && findSub(docRef.current, id);
    if (!f) return;
    const next = replaceSubsection(docRef.current!, { ...f.sub, ...patch });
    docRef.current = next; setDoc(next);
  };
  const patchBlock = (subId: string, blockId: string, patch: Partial<PlanBlock>) => {
    const f = docRef.current && findSub(docRef.current, subId);
    if (!f) return;
    const next = replaceSubsection(docRef.current!, {
      ...f.sub,
      blocks: f.sub.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } as PlanBlock : b)),
    });
    docRef.current = next; setDoc(next);
  };
  const deleteBlock = (subId: string, blockId: string) => {
    const f = docRef.current && findSub(docRef.current, subId);
    if (!f) return;
    const next = replaceSubsection(docRef.current!, { ...f.sub, blocks: f.sub.blocks.filter((b) => b.id !== blockId) });
    docRef.current = next; setDoc(next);
  };
  const moveBlock = (subId: string, blockId: string, dir: -1 | 1) => {
    const f = docRef.current && findSub(docRef.current, subId);
    if (!f) return;
    const idx = f.sub.blocks.findIndex((b) => b.id === blockId);
    const target = idx + dir;
    if (idx === -1 || target < 0 || target >= f.sub.blocks.length) return;
    const blocks = [...f.sub.blocks];
    [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
    const next = replaceSubsection(docRef.current!, { ...f.sub, blocks });
    docRef.current = next; setDoc(next);
  };
  const handleRewrite = async (subId: string, instruction?: string) => {
    const d = docRef.current;
    const req = getReq();
    if (!d || !req) return;
    const f = findSub(d, subId);
    if (!f) return;
    setRewriteBusyId(subId);
    try {
      const filled = await fillPlanSubsection(f.sub, f.chapter, req, { instruction, keyClaims: keyClaimsRef.current });
      const next = replaceSubsection(d, filled);
      docRef.current = next; setDoc(next);
      savePlanCheckpoint(next, req);
      recordAiQueryUsage(user.id, user.subscriptionPlan || 'free');
      setToast('Section rewritten.');
    } catch (e) {
      handleGeminiError(e);
      setToast('Rewrite failed — please try again.');
    } finally {
      setRewriteBusyId(null);
    }
  };
  const addPoolSection = (chapterId: string, item: SubsectionTemplate, generate: boolean) => {
    const d = docRef.current;
    if (!d) return;
    const chapter = d.chapters.find((c) => c.id === chapterId);
    if (!chapter) return;
    const sub: PlanSubsection = {
      id: newId('sub'), title: item.title, brief: item.brief, recipe: item.recipe,
      targetWords: 850, status: 'outline', blocks: [], optional: true, poolId: item.poolId,
    };
    const next = addSubsection(d, chapterId, sub);
    docRef.current = next; setDoc(next);
    setAddMenuFor(null);
    if (generate) {
      setSelected({ kind: 'sub', id: sub.id });
      void (async () => {
        setRewriteBusyId(sub.id);
        try {
          const filled = await fillPlanSubsection(sub, chapter, getReq()!, { keyClaims: keyClaimsRef.current });
          const d2 = replaceSubsection(docRef.current!, filled);
          docRef.current = d2; setDoc(d2);
          savePlanCheckpoint(d2, getReq()!);
        } catch (e) { handleGeminiError(e); }
        finally { setRewriteBusyId(null); }
      })();
    }
  };
  const removeSub = (subId: string) => {
    if (!docRef.current) return;
    const next = removeSubsection(docRef.current, subId);
    docRef.current = next; setDoc(next);
  };

  // ── Resume / save / export ───────────────────────────────────────────────
  const doResume = () => {
    if (!resumeCp) return;
    docRef.current = resumeCp.doc;
    setDoc(resumeCp.doc);
    genReqRef.current = resumeCp.req;
    const s = resumeCp.req?.fundingNeedsSummary;
    fundingClaimsRef.current = s?.count
      ? fundingClaimsFromSummary(s, resumeCp.req.requestedAmountLabel)
      : [];
    keyClaimsRef.current = [...fundingClaimsRef.current, ...extractKeyClaims(resumeCp.doc)];
    setResumeCp(null);
    setStep('editor');
  };
  const discardResume = () => {
    clearPlanCheckpoint();
    setResumeCp(null);
  };

  /** Opens a cloud-saved plan straight into the editor. */
  const openSavedPlan = async (planId: string) => {
    setToast('Loading plan…');
    const loaded = await getPlanDoc(user.id, planId);
    if (!loaded) {
      setToast('Could not load that plan — it may have been deleted.');
      return;
    }
    docRef.current = loaded.plan;
    setDoc(loaded.plan);
    genReqRef.current = loaded.req || buildReqFromFields();
    const s = loaded.req?.fundingNeedsSummary;
    fundingClaimsRef.current = s?.count
      ? fundingClaimsFromSummary(s, loaded.req?.requestedAmountLabel || '')
      : [];
    keyClaimsRef.current = [...fundingClaimsRef.current, ...extractKeyClaims(loaded.plan)];
    setResumeCp(null);
    setStep('editor');
  };

  const deleteSavedPlan = async (planId: string) => {
    if (!window.confirm('Delete this saved plan? This cannot be undone.')) return;
    try {
      await deletePlanDoc(user.id, planId);
      setSavedPlans((prev) => prev.filter((p) => p.id !== planId));
      setToast('Plan deleted.');
    } catch {
      setToast('Could not delete that plan — try again.');
    }
  };

  const cloudSave = async (silent = false) => {
    const d = docRef.current;
    const req = getReq();
    if (!d || !req) return;
    if (!silent) setSavingCloud(true);
    try {
      await savePlanDoc(user.id, d, req);
      if (!silent) setToast('Plan saved to your account.');
      // Refresh the saved-plans list (cheap: ≤12 docs).
      listSavedPlans(user.id).then(setSavedPlans).catch(() => undefined);
    } catch (e) {
      console.warn('[PlanStudio] cloud save failed', e);
      if (!silent) setToast('Cloud save failed — your draft is still safe on this device.');
    } finally {
      if (!silent) setSavingCloud(false);
    }
  };
  const saveToCloud = () => cloudSave(false);

  // Autosave to the cloud while editing (45s after the last change).
  useEffect(() => {
    if (step !== 'editor' || !doc) return;
    if (genRunningRef.current || deepenBusyRef.current) return;
    const t = window.setTimeout(() => { void cloudSave(true); }, 45_000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, doc]);

  const handleExportDocx = async () => {
    const d = docRef.current;
    if (!d) return;
    setDocxExporting(true);
    setExportError(null);
    try {
      const filename = `${(d.meta.businessName || 'Business').replace(/\s+/g, '_')}_Business_Plan.docx`;
      const brand = {
        businessName: brandKit?.businessName || d.meta.businessName,
        tagline: brandKit?.tagline || d.meta.tagline,
        logoDataUrl: brandKit?.logoDataUrl || '',
        logoWidth: brandKit?.logoWidth || 0,
        logoHeight: brandKit?.logoHeight || 0,
        accentColor: theme.accent,
      };
      const result = await exportPlanDocx(d, filename, brand);
      if (!result.ok) setExportError(result.error || 'Word export failed. Please try again.');
      else setToast('Word document downloaded — fully editable.');
    } catch (e: any) {
      setExportError(e?.message || 'Word export failed. Please try again.');
    } finally {
      setDocxExporting(false);
    }
  };

  const handleExport = async () => {
    const container = previewRef.current;
    if (!container || !doc) return;
    setExporting(true);
    setExportError(null);
    setExportMsg(null);
    try {
      await new Promise((r) => setTimeout(r, 150));
      const pages = Array.from(container.querySelectorAll('.pdf-page')) as HTMLElement[];
      const filename = `${(doc.meta.businessName || 'Business').replace(/\s+/g, '_')}_Business_Plan.pdf`;
      const result = await exportPlanToPdf(pages, filename, { onProgress: setExportMsg });
      if (!result.ok) setExportError(result.error || 'Export failed. Please try again.');
      else if (result.mode === 'text') setToast(`Business plan downloaded — ${paginated?.totalPages} pages.`);
      else if (result.failedPages && result.failedPages.length) setExportError(`Downloaded, but page(s) ${result.failedPages.join(', ')} couldn't render — try exporting again.`);
      else setToast('Business plan PDF downloaded (image mode).');
    } catch (e: any) {
      setExportError(e?.message || 'Export failed. Please try again.');
    } finally {
      setExporting(false);
      setExportMsg(null);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  // Scroll the preview to the selected subsection's first page.
  useEffect(() => {
    if (step !== 'editor' || !paginated || selected.kind !== 'sub') return;
    const page = paginated.pages.find((p) => p.subsectionId === selected.id);
    if (page === undefined) return;
    const el = previewRef.current?.querySelector(`[data-page="${page.index}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selected, paginated, step]);

  // ── Derived editor values ────────────────────────────────────────────────
  const pendingCount = doc
    ? doc.chapters.reduce((n, c) => n + c.subsections.filter((s) => !s.deterministic && s.status !== 'filled').length, 0)
    : 0;
  const totalWords = doc ? documentWordCount(doc) : 0;
  const selectedSub = selected.kind === 'sub' && doc ? findSub(doc, selected.id) : null;
  const pageBadge = paginated
    ? {
        pages: paginated.totalPages,
        ok: paginated.totalPages >= (doc?.depth.minPages ?? 70) && paginated.totalPages <= (doc?.depth.maxPages ?? 120),
        low: paginated.totalPages < (doc?.depth.minPages ?? 70),
      }
    : null;

  const stepIndex = step === 'setup' ? 1 : step === 'outline' ? 2 : step === 'generating' ? 3 : 4;
  const stepLabels = ['Details', 'Outline', 'Writing', 'Edit & Export'];

  const header = (
    <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
          <BookOpen size={16} className="text-emerald-400" />
        </div>
        <div>
          <div className="text-sm font-bold text-white leading-tight">Business Plan Studio</div>
          <div className="text-[11px] text-slate-400">Full funder-ready plans · 70–120 pages · sober &amp; professional</div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {stepIndex > 1 && pageBadge && (
          <span className={`hidden md:flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${
            pageBadge.ok ? 'bg-emerald-500/15 text-emerald-300' : pageBadge.low ? 'bg-amber-500/15 text-amber-300' : 'bg-red-500/15 text-red-300'
          }`}>
            {pageBadge.pages} pages {pageBadge.ok ? '✓' : pageBadge.low ? `· expanding to ${doc?.depth.minPages}` : `· over ${doc?.depth.maxPages}`}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          {stepLabels.map((label, i) => {
            const n = i + 1;
            const active = n === stepIndex;
            const done = n < stepIndex;
            return (
              <React.Fragment key={label}>
                {i > 0 && <ChevronDown size={12} className="text-slate-700 -rotate-90" />}
                <span className={`flex items-center gap-1.5 text-xs font-semibold ${active ? 'text-white' : done ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    active ? 'bg-emerald-500 text-white' : done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                  }`}>{done ? <Check size={11} /> : n}</span>
                  <span className="hidden lg:inline">{label}</span>
                </span>
              </React.Fragment>
            );
          })}
        </div>
        {step === 'editor' && (
          <>
            <button
              onClick={saveToCloud}
              disabled={savingCloud}
              className="flex items-center gap-1.5 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 font-semibold text-xs px-3 py-2 rounded-lg transition"
              title="Save to your account"
            >
              {savingCloud ? <Loader2 size={13} className="animate-spin" /> : <Cloud size={13} />}
              <span className="hidden sm:inline">Save</span>
            </button>
            <button
              onClick={handleExportDocx}
              disabled={docxExporting || !doc}
              className="flex items-center gap-1.5 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 font-semibold text-xs px-3 py-2 rounded-lg transition"
              title="Download as an editable Word document"
            >
              {docxExporting ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
              <span className="hidden sm:inline">Word</span>
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || !paginated}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-slate-950 font-bold text-sm px-4 py-2 rounded-lg transition"
            >
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {exporting ? (exportMsg ? 'Rendering…' : 'Preparing…') : 'Download PDF'}
            </button>
          </>
        )}
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition" aria-label="Close">
          <X size={18} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col animate-in fade-in duration-300">
      {header}

      {/* ═══════ SETUP ═══════ */}
      {step === 'setup' && (
        <div className="flex-1 overflow-y-auto">
          <PlanSetupPanel
            state={setup}
            patch={patchSetup}
            opportunities={opportunities}
            ctx={ctx}
            ctxLoading={ctxLoading}
            depth={depth}
            quota={quota}
            estTokens={estTokens}
            fundingNeeds={fundingNeedsSummary.count ? toPanelInfo(fundingNeedsSummary, parseRand(setup.amount)) : null}
            brandAccent={brandKit?.accentColor || null}
            savedPlans={savedPlans}
            onOpenSavedPlan={(id) => void openSavedPlan(id)}
            onDeleteSavedPlan={(id) => void deleteSavedPlan(id)}
            resume={resumeCp ? {
              label: `${resumeCp.doc.meta.businessName} — ${resumeCp.doc.meta.planTitle}`,
              sub: `≈ ${Math.round(documentWordCount(resumeCp.doc) / 360) + 17} pages · saved ${new Date(resumeCp.savedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} — resume where you left off`,
            } : null}
            onResume={doResume}
            onDiscardResume={discardResume}
            onGenerate={startOutline}
            busy={outlineBusy}
          />
        </div>
      )}

      {/* ═══════ OUTLINE ═══════ */}
      {step === 'outline' && doc && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8">
            <button onClick={() => setStep('setup')} className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white mb-4 transition">
              <ChevronLeft size={14} /> Back to details
            </button>
            <h2 className="text-xl font-extrabold text-white mb-1">Review the structure</h2>
            <p className="text-sm text-slate-400 mb-6">
              {doc.chapters.length} chapters · {doc.chapters.reduce((n, c) => n + c.subsections.length, 0)} sections · target {doc.depth.targetPages} pages ({doc.depth.minPages}–{doc.depth.maxPages} acceptable). Drop or add sections now — nothing is written yet.
            </p>

            <div className="space-y-3">
              {doc.chapters.map((ch) => {
                const tpl = CHAPTER_CATALOG.find((c) => c.id === ch.id);
                const unusedPool = tpl ? tpl.pool.filter((p) => !ch.subsections.some((s) => s.poolId === p.poolId)) : [];
                return (
                  <div key={ch.id} className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[10px] font-black text-emerald-400 w-6 flex-shrink-0">{String(ch.number).padStart(2, '0')}</span>
                        <span className="text-sm font-bold text-white truncate">{ch.title}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 flex-shrink-0">{ch.subsections.length} sections</span>
                    </div>
                    <div className="divide-y divide-slate-800/60">
                      {ch.subsections.map((s) => {
                        const required = isRequiredSub(ch.id, s.poolId) || s.deterministic;
                        return (
                          <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] text-slate-200 truncate">{s.title}</div>
                              <div className="text-[11px] text-slate-500 truncate">{s.brief}</div>
                            </div>
                            <span className="text-[10px] text-slate-500 flex-shrink-0">≈{s.targetWords}w</span>
                            {required ? (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600 flex-shrink-0">required</span>
                            ) : (
                              <button onClick={() => removeSub(s.id)} className="p-1 text-slate-600 hover:text-red-400 transition flex-shrink-0" title="Remove section">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {unusedPool.length > 0 && (
                      <div className="px-4 py-2.5 bg-slate-900/40">
                        {addMenuFor === ch.id ? (
                          <div className="space-y-1">
                            {unusedPool.map((p) => (
                              <button
                                key={p.poolId}
                                onClick={() => addPoolSection(ch.id, p, false)}
                                className="w-full text-left px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-[12px] text-slate-200 transition"
                              >
                                + {p.title}
                                <span className="block text-[10.5px] text-slate-500">{p.brief}</span>
                              </button>
                            ))}
                            <button onClick={() => setAddMenuFor(null)} className="text-[11px] text-slate-500 hover:text-slate-300 pt-1">cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => { setAddMenuFor(addMenuFor === ch.id ? null : ch.id); }} className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition">
                            <Plus size={12} /> Add a section ({unusedPool.length} available)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-8 mb-12">
              <span className="text-xs text-slate-500">Writing takes ≈ {Math.max(6, Math.round(doc.depth.targetWords / 2600))}–{Math.max(10, Math.round(doc.depth.targetWords / 1500))} minutes. Progress is saved after every section.</span>
              <button
                onClick={continueOrStartWriting}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-5 py-3 rounded-xl transition flex-shrink-0"
              >
                <Sparkles size={16} />
                Start writing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ GENERATING ═══════ */}
      {step === 'generating' && doc && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-12">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/15 mb-4">
                <Loader2 size={24} className="text-emerald-400 animate-spin" />
              </div>
              <h2 className="text-xl font-extrabold text-white mb-1">Writing your business plan</h2>
              <p className="text-sm text-slate-400">
                {genDone} of {genTotal} sections written · {totalWords.toLocaleString('en-ZA')} words · {fmtElapsed(genElapsed)} elapsed
              </p>
              {genCurrent && <p className="text-xs text-emerald-400 mt-2 font-semibold">✍ {genCurrent}</p>}
              {genFailCount > 0 && (
                <p className="text-xs text-amber-400 mt-1.5">{genFailCount} section{genFailCount > 1 ? 's' : ''} failed — you can retry them in the editor</p>
              )}
            </div>

            <div className="h-2 rounded-full bg-slate-800 overflow-hidden mb-8">
              <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${genTotal ? Math.round((genDone / genTotal) * 100) : 0}%` }} />
            </div>

            {paginated && (
              <p className="text-center text-xs text-slate-500 mb-8">
                Projected length: <span className="text-slate-300 font-bold">≈ {paginated.projectedTotalPages} pages</span> (target {doc.depth.targetPages})
              </p>
            )}

            <div className="space-y-4">
              {doc.chapters.map((ch) => (
                <div key={ch.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <span className="text-[10px] font-black text-emerald-400">{String(ch.number).padStart(2, '0')}</span>
                    <span className="text-[13px] font-bold text-slate-200">{ch.title}</span>
                  </div>
                  <div className="space-y-1.5">
                    {ch.subsections.map((s) => {
                      const icon =
                        s.deterministic ? <Check size={12} className="text-slate-500" /> :
                        s.status === 'filled' ? <Check size={12} className="text-emerald-400" /> :
                        s.status === 'failed' ? <AlertTriangle size={12} className="text-red-400" /> :
                        genCurrent === s.title ? <Loader2 size={12} className="text-emerald-400 animate-spin" /> :
                        <span className="w-3 h-3 rounded-full border-2 border-slate-700 block" />;
                      return (
                        <div key={s.id} className="flex items-center gap-2.5">
                          <span className="w-3.5 flex-shrink-0 flex justify-center">{icon}</span>
                          <span className={`text-[12px] truncate ${s.status === 'filled' ? 'text-slate-300' : s.status === 'failed' ? 'text-red-300' : genCurrent === s.title ? 'text-white font-semibold' : 'text-slate-500'}`}>
                            {s.title}
                          </span>
                          {s.status === 'filled' && (
                            <span className="text-[10px] text-slate-600 ml-auto flex-shrink-0">{subsectionWordCount(s).toLocaleString('en-ZA')}w</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center mt-8 mb-12">
              <button
                onClick={() => { abortRef.current = true; }}
                className="text-xs font-semibold text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-4 py-2 rounded-lg transition"
              >
                Stop and edit what's written so far
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ EDITOR ═══════ */}
      {step === 'editor' && doc && paginated && (
        <div className="flex-1 flex min-h-0">
          {/* Left: tree */}
          <div className="w-[260px] flex-shrink-0 border-r border-slate-800 overflow-y-auto bg-slate-900/40">
            <button
              onClick={() => setSelected({ kind: 'meta' })}
              className={`w-full flex items-center gap-2 px-4 py-3 text-left border-b border-slate-800 transition ${selected.kind === 'meta' ? 'bg-emerald-500/10 text-white' : 'text-slate-300 hover:bg-slate-800/50'}`}
            >
              <FileText size={13} className={selected.kind === 'meta' ? 'text-emerald-400' : 'text-slate-500'} />
              <span className="text-[12.5px] font-bold">Cover &amp; contact</span>
            </button>
            {doc.chapters.map((ch) => (
              <div key={ch.id} className="border-b border-slate-800/60">
                <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                  <span className="text-[9.5px] font-black text-emerald-400/80">{String(ch.number).padStart(2, '0')}</span>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide truncate">{ch.title}</span>
                </div>
                {ch.subsections.map((s) => {
                  const active = selected.kind === 'sub' && selected.id === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelected({ kind: 'sub', id: s.id })}
                      className={`w-full flex items-center gap-2 pl-6 pr-3 py-1.5 text-left transition ${active ? 'bg-emerald-500/10' : 'hover:bg-slate-800/50'}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.status === 'filled' ? '#34d399' : s.status === 'failed' ? '#f87171' : '#475569' }} />
                      <span className={`text-[12px] truncate ${active ? 'text-white font-semibold' : 'text-slate-400'}`}>{s.title}</span>
                      {rewriteBusyId === s.id && <Loader2 size={10} className="animate-spin text-emerald-400 ml-auto flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
            {pendingCount > 0 && (
              <div className="p-4">
                <button
                  onClick={continueOrStartWriting}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-3 py-2.5 rounded-lg transition"
                >
                  <RefreshCw size={13} /> Continue writing ({pendingCount})
                </button>
              </div>
            )}
          </div>

          {/* Center: preview */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/40 flex-shrink-0">
              <span className="text-[11px] text-slate-400">
                {paginated.totalPages} pages · {totalWords.toLocaleString('en-ZA')} words
                {pageBadge && !pageBadge.ok && (pageBadge.low
                  ? <span className="text-amber-400 font-semibold"> · below the {doc.depth.minPages}-page floor</span>
                  : <span className="text-red-400 font-semibold"> · trimming to {doc.depth.maxPages}</span>)}
              </span>
              <div className="flex items-center gap-1.5">
                {deepenNote && <span className="text-[10.5px] text-emerald-300 font-semibold animate-pulse mr-2">{deepenNote}</span>}
                <button onClick={() => setZoom((z) => Math.max(0.35, +(z - 0.08).toFixed(2)))} className="p-1.5 text-slate-400 hover:text-white transition"><ZoomOut size={14} /></button>
                <span className="text-[10.5px] text-slate-500 w-9 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((z) => Math.min(1.2, +(z + 0.08).toFixed(2)))} className="p-1.5 text-slate-400 hover:text-white transition"><ZoomIn size={14} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-950/80 p-6" ref={previewRef}>
              <div style={{ width: PAGE_W * zoom, margin: '0 auto' }}>
                {paginated.pages.map((page) => (
                  <div
                    key={page.index}
                    data-page={page.index}
                    style={{ width: PAGE_W * zoom, height: PAGE_H * zoom, position: 'relative', marginBottom: 20 * zoom }}
                  >
                    <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: PAGE_W, height: PAGE_H }}>
                      {page.kind === 'cover' ? (
                        <PlanCoverPage meta={doc.meta} theme={theme} total={paginated.totalPages} logoUrl={brandKit?.logoDataUrl || undefined} />
                      ) : page.kind === 'toc' ? (
                        <PlanTocPage rows={page.tocRows || []} meta={doc.meta} theme={theme} pageNo={page.pageNo} total={paginated.totalPages} showTitle={page.index === 1} />
                      ) : page.kind === 'chapter' ? (
                        (() => {
                          const ch = doc.chapters.find((c) => c.id === page.chapterId);
                          return ch ? (
                            <PlanChapterOpener chapter={ch} meta={doc.meta} theme={theme} pageNo={page.pageNo} total={paginated.totalPages} />
                          ) : null;
                        })()
                      ) : (
                        (() => {
                          const ch = doc.chapters.find((c) => c.id === page.chapterId);
                          return (
                            <PlanContentPage
                              page={page}
                              chapterTitle={ch ? ch.title : ''}
                              meta={doc.meta}
                              theme={theme}
                              pageNo={page.pageNo}
                              total={paginated.totalPages}
                            />
                          );
                        })()
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: editor panel */}
          <div className="w-[350px] flex-shrink-0 border-l border-slate-800 overflow-y-auto bg-slate-900/40 p-4">
            {exportError && (
              <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[11.5px] p-3">{exportError}</div>
            )}
            <PlanEditorPanel
              mode={selected.kind === 'meta' ? 'meta' : 'subsection'}
              meta={doc.meta}
              subsection={selectedSub?.sub ?? null}
              chapterTitle={selectedSub?.chapter.title ?? ''}
              rewriteBusy={rewriteBusyId !== null}
              onPatchMeta={patchMeta}
              onPatchSubsection={patchSubsection}
              onPatchBlock={patchBlock}
              onDeleteBlock={deleteBlock}
              onMoveBlock={moveBlock}
              onRewrite={handleRewrite}
            />
            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center gap-2 text-[10.5px] text-slate-500">
              <PenLine size={11} />
              Every AI-written word is editable. The PDF is a real text document — selectable and searchable.
            </div>
          </div>
        </div>
      )}

      {/* Measure layer — always mounted once a doc exists (feeds pagination) */}
      {doc && <PlanMeasureLayer doc={doc} theme={theme} containerRef={measureRef} />}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[210] bg-slate-800 border border-slate-700 text-white text-sm px-4 py-2.5 rounded-xl shadow-2xl">
          {toast}
        </div>
      )}
      {exporting && exportMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[210] bg-slate-800 border border-slate-700 text-slate-200 text-sm px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-emerald-400" />
          {exportMsg}
        </div>
      )}
    </div>
  );
};

export default BusinessPlanStudio;
