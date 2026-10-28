// components/businessPlan/PlanSetupPanel.tsx
/**
 * StacFund — Business Plan Studio: SETUP step
 * ===========================================
 * One screen that answers the user's first question before they commit:
 * "How long will my plan be?" The depth engine's verdict is shown live —
 * target pages, the acceptable band, word budget, estimated generation time
 * and AI-credit usage — updating as the funder and amount change.
 *
 * Also surfaces the REAL funding-needs register (the Financial Plan chapter
 * is built from those figures), the Brand Kit accent, and cloud-saved plans.
 */
import React from 'react';
import { Loader2, Sparkles, ShieldCheck, AlertTriangle, HelpCircle, BookOpen, Cloud, Wallet, Trash2, FolderOpen } from 'lucide-react';
import type { FundingOpportunityDb } from '../../types';
import type { AutofillContext } from '../../services/autofillContext';
import type { DepthProfile, DepthOverride } from '../../services/businessPlan/planDepth';
import { formatRandAmount, type FundingNeedsPanelInfo } from '../../services/businessPlan/planFinancials';
import type { SavedDocSummary } from '../../services/studioDocs';
import { PLAN_THEMES } from './PlanBlocks';

export interface PlanSetupState {
  businessName: string;
  tagline: string;
  preparedBy: string;
  contactEmail: string;
  contactPhone: string;
  contactWebsite: string;
  contactAddress: string;
  amount: string;
  purpose: string;
  preparedFor: string;
  opportunityId: string;
  themeId: string;
  depthOverride: DepthOverride;
}

export interface PlanSetupPanelProps {
  state: PlanSetupState;
  patch: (p: Partial<PlanSetupState>) => void;
  opportunities: FundingOpportunityDb[];
  ctx: AutofillContext | null;
  ctxLoading: boolean;
  depth: DepthProfile;
  quota: { used: number; limit: number } | null;
  estTokens: number;
  /** Real funding-needs register summary (null when the user has none). */
  fundingNeeds?: FundingNeedsPanelInfo | null;
  /** Brand-kit accent hex — adds a "Brand" swatch to the Look section. */
  brandAccent?: string | null;
  /** Cloud-saved plans (resume list). */
  savedPlans?: SavedDocSummary[];
  onOpenSavedPlan?: (id: string) => void;
  onDeleteSavedPlan?: (id: string) => void;
  resume: { label: string; sub: string } | null;
  onResume: () => void;
  onDiscardResume: () => void;
  onGenerate: () => void;
  busy: boolean;
}

const labelCls = 'block text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] mb-1.5';
const inputCls =
  'w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 transition';

const OVERRIDES: { id: DepthOverride; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'concise', label: 'Concise' },
  { id: 'standard', label: 'Standard' },
  { id: 'comprehensive', label: 'Comprehensive' },
  { id: 'maximum', label: 'Maximum' },
];

const PlanSetupPanel: React.FC<PlanSetupPanelProps> = ({
  state, patch, opportunities, ctx, ctxLoading, depth, quota, estTokens,
  fundingNeeds, brandAccent, savedPlans, onOpenSavedPlan, onDeleteSavedPlan,
  resume, onResume, onDiscardResume, onGenerate, busy,
}) => {
  const fmtRand = (raw: string): string => {
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) return '';
    return `R${Number(digits).toLocaleString('en-ZA').replace(/,/g, ' ')}`;
  };

  const readiness = ctx
    ? (() => {
        const rules = ctx.eligibility.rules || [];
        const fail = rules.filter((r) => r.verdict === 'fail').length;
        const unknown = rules.filter((r) => r.verdict === 'unknown').length;
        const pass = rules.filter((r) => r.verdict === 'pass').length;
        return { fail, unknown, pass, eligible: ctx.eligibility.eligible };
      })()
    : null;

  const quotaPct = quota && quota.limit > 0 ? Math.min(100, Math.round((estTokens / quota.limit) * 100)) : null;
  const quotaRemaining = quota ? Math.max(0, quota.limit - quota.used) : null;
  const quotaShort = quotaRemaining !== null && estTokens > quotaRemaining;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 grid lg:grid-cols-[1fr_400px] gap-8">
      {/* ── Left: the form ── */}
      <div>
        <button onClick={onDiscardResume} className="hidden" aria-hidden="true" />
        <h2 className="text-xl font-extrabold text-white mb-1">The full funder-ready business plan</h2>
        <p className="text-sm text-slate-400 mb-6">
          70–120 pages, professional and sober — text, tables and graphs only. We prefill from your profile; link a funder and the plan is written to their rules.
        </p>

        {resume && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Cloud size={18} className="text-emerald-400 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{resume.label}</div>
                <div className="text-xs text-slate-400 truncate">{resume.sub}</div>
              </div>
            </div>
            <button
              onClick={onResume}
              className="flex-shrink-0 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-lg transition"
            >
              Resume
            </button>
          </div>
        )}

        {/* Cloud-saved plans — open or delete straight into the editor */}
        {savedPlans && savedPlans.length > 0 && (
          <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen size={14} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Your saved plans</span>
            </div>
            <div className="space-y-2">
              {savedPlans.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg bg-slate-800/50 border border-slate-800 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-slate-200 truncate">{p.title}</div>
                    <div className="text-[11px] text-slate-500">
                      ≈ {p.pagesEst} pages · {p.words.toLocaleString('en-ZA')} words · updated{' '}
                      {new Date(p.updatedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                  <button
                    onClick={() => onOpenSavedPlan?.(p.id)}
                    className="flex-shrink-0 text-[11px] font-bold text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-md transition"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => onDeleteSavedPlan?.(p.id)}
                    className="flex-shrink-0 p-1.5 text-slate-600 hover:text-red-400 transition"
                    title="Delete plan"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Business name</label>
              <input className={inputCls} value={state.businessName} onChange={(e) => patch({ businessName: e.target.value })} placeholder="e.g. Nawi-Learn Toddler Centre" />
            </div>
            <div>
              <label className={labelCls}>Prepared by</label>
              <input className={inputCls} value={state.preparedBy} onChange={(e) => patch({ preparedBy: e.target.value })} placeholder="Owner / director" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Tagline (cover page)</label>
            <input className={inputCls} value={state.tagline} onChange={(e) => patch({ tagline: e.target.value })} placeholder="One line under the title, e.g. \u201cIgniting curiosity in every child\u201d" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Funding requested (R)</label>
              <input className={inputCls} value={state.amount} onChange={(e) => patch({ amount: e.target.value })} placeholder="e.g. 1500000" inputMode="numeric" />
              {fmtRand(state.amount) && <div className="text-xs text-emerald-400 mt-1.5 font-semibold">{fmtRand(state.amount)}</div>}
            </div>
            <div>
              <label className={labelCls}>Prepared for (funder)</label>
              <input className={inputCls} value={state.preparedFor} onChange={(e) => patch({ preparedFor: e.target.value })} placeholder="Auto-filled from the opportunity" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Link a funding opportunity (recommended)</label>
            <select className={inputCls} value={state.opportunityId} onChange={(e) => patch({ opportunityId: e.target.value })}>
              <option value="">General plan — no specific funder</option>
              {opportunities.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.issuer_name || 'Funder'} — {o.programme_name || 'Programme'}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2 mt-2 min-h-[22px]">
              {ctxLoading && <Loader2 size={13} className="animate-spin text-slate-500" />}
              {!ctxLoading && readiness && (
                <span className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                  readiness.fail > 0 ? 'bg-red-500/15 text-red-300' : readiness.unknown > 0 ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
                }`}>
                  {readiness.fail > 0 ? <AlertTriangle size={12} /> : readiness.unknown > 0 ? <HelpCircle size={12} /> : <ShieldCheck size={12} />}
                  {readiness.fail > 0 ? `${readiness.fail} eligibility blocker${readiness.fail > 1 ? 's' : ''}` : readiness.unknown > 0 ? `${readiness.pass} rules met · ${readiness.unknown} to confirm` : `${readiness.pass} funder rules met`}
                </span>
              )}
              {!ctxLoading && ctx && ctx.missingDocuments.length > 0 && (
                <span className="text-[11px] text-slate-500">{ctx.missingDocuments.length} document{ctx.missingDocuments.length > 1 ? 's' : ''} still to upload — the plan will flag them</span>
              )}
            </div>
          </div>

          <div>
            <label className={labelCls}>What is the funding for?</label>
            <textarea
              className={`${inputCls} min-h-[88px] resize-y`}
              value={state.purpose}
              onChange={(e) => patch({ purpose: e.target.value })}
              placeholder="e.g. Fit-out of a second early-learning campus in Umzimkhulu, STEAM learning equipment, and 18 months of working capital"
            />
          </div>

          {/* Real figures from the Funding Needs Tracker */}
          <div
            className={`rounded-xl border p-4 ${
              fundingNeeds
                ? fundingNeeds.coveragePct !== null && fundingNeeds.coveragePct >= 95
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-amber-500/30 bg-amber-500/5'
                : 'border-slate-800 bg-slate-900/60'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Wallet size={14} className={fundingNeeds ? 'text-emerald-400' : 'text-slate-500'} />
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Financials — your real figures</span>
            </div>
            {fundingNeeds ? (
              <>
                <p className="text-[12px] text-slate-300 leading-relaxed">
                  {fundingNeeds.count} costed item{fundingNeeds.count > 1 ? 's' : ''} from your Funding Needs Tracker totalling{' '}
                  <span className="font-bold text-white">{formatRandAmount(fundingNeeds.totalRand)}</span>
                  {fundingNeeds.requestedRand > 0 ? (
                    <>
                      {' '}against the <span className="font-bold text-white">{formatRandAmount(fundingNeeds.requestedRand)}</span> requested
                      {fundingNeeds.coveragePct !== null && (
                        <span className={`font-bold ${fundingNeeds.coveragePct >= 95 ? 'text-emerald-300' : 'text-amber-300'}`}>
                          {' '}({fundingNeeds.coveragePct}% itemised)
                        </span>
                      )}
                      .
                    </>
                  ) : (
                    '. Enter the amount requested above to reconcile the register against it.'
                  )}
                </p>
                <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                  The Financial Plan chapter is built from these real figures — the itemised use-of-funds table, totals and reconciliation are generated in code, never AI-estimated.
                  {fundingNeeds.gapRand > 0 && (
                    <span className="text-amber-300"> Shortfall of {formatRandAmount(fundingNeeds.gapRand)} — add the missing items in the Needs tab or motivate the balance as contingency.</span>
                  )}
                  {fundingNeeds.receivedExcluded > 0 && (
                    <span> {fundingNeeds.receivedExcluded} already-funded item{fundingNeeds.receivedExcluded > 1 ? 's are' : ' is'} excluded.</span>
                  )}
                </p>
              </>
            ) : (
              <p className="text-[12px] text-slate-400 leading-relaxed">
                No funding-needs items yet. Add costed items in the <span className="font-semibold text-slate-300">Needs</span> tab and the Financial Plan
                chapter will use your real figures — itemised, sourced and quotation-backed — instead of AI placeholders.
              </p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Contact email</label>
              <input className={inputCls} value={state.contactEmail} onChange={(e) => patch({ contactEmail: e.target.value })} placeholder="you@business.co.za" />
            </div>
            <div>
              <label className={labelCls}>Contact phone</label>
              <input className={inputCls} value={state.contactPhone} onChange={(e) => patch({ contactPhone: e.target.value })} placeholder="079 000 0000" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Website</label>
              <input className={inputCls} value={state.contactWebsite} onChange={(e) => patch({ contactWebsite: e.target.value })} placeholder="www.business.co.za" />
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input className={inputCls} value={state.contactAddress} onChange={(e) => patch({ contactAddress: e.target.value })} placeholder="Street, town, province" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: depth + look ── */}
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen size={15} className="text-emerald-400" />
            <span className="text-sm font-bold text-white">Length & depth</span>
          </div>
          <p className="text-[11px] text-slate-500 mb-4">Set automatically from the funder and the amount requested.</p>

          <div className="flex items-center gap-1 mb-4">
            {OVERRIDES.map((o) => (
              <button
                key={o.id}
                onClick={() => patch({ depthOverride: o.id })}
                className={`flex-1 text-[10.5px] font-bold px-2 py-1.5 rounded-md transition ${
                  state.depthOverride === o.id ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="text-center py-4 border-y border-slate-800 mb-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-1">Target length</div>
            <div className="text-4xl font-black text-white leading-none">
              {depth.targetPages} <span className="text-base font-bold text-slate-400">pages</span>
            </div>
            <div className="text-xs text-slate-400 mt-2">
              acceptable band {depth.minPages}–{depth.maxPages} · {depth.label}
            </div>
          </div>

          <dl className="text-xs space-y-2 mb-4">
            <div className="flex justify-between"><dt className="text-slate-500">Funder profile</dt><dd className="text-slate-300 font-semibold text-right">{depth.categoryLabel}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Word budget</dt><dd className="text-slate-300 font-semibold">{depth.targetWords.toLocaleString('en-ZA')} words</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Generation time</dt><dd className="text-slate-300 font-semibold">≈ {Math.max(6, Math.round(depth.targetWords / 2600))}–{Math.max(10, Math.round(depth.targetWords / 1500))} min</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Sections written</dt><dd className="text-slate-300 font-semibold">{35 + Math.round(depth.expansionRatio * 24)}–{45 + Math.round(depth.expansionRatio * 20)} AI calls</dd></div>
          </dl>

          {quota && (
            <div className={`rounded-lg p-3 text-[11px] leading-relaxed ${quotaShort ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-800/60 text-slate-400'}`}>
              <div className="flex justify-between mb-1.5">
                <span>Estimated AI usage</span>
                <span className="font-bold">{(estTokens / 1000).toFixed(0)}k tokens {quotaPct !== null ? `(${quotaPct}% of monthly)` : ''}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                <div className={`h-full rounded-full ${quotaShort ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, quotaPct ?? 0)}%` }} />
              </div>
              {quotaShort && (
                <p className="mt-2 text-amber-300/90">
                  This plan needs more AI credits than remain this month. You can still start — generate what fits and continue next cycle.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-sm font-bold text-white mb-1">Look</div>
          <p className="text-[11px] text-slate-500 mb-4">Professional &amp; sober — serif text, one accent colour, thin rules. No stock imagery, no decorative graphics.</p>
          <div className="grid grid-cols-2 gap-2.5">
            {PLAN_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => patch({ themeId: t.id })}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition text-left ${
                  state.themeId === t.id ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-800 hover:border-slate-600'
                }`}
              >
                <span className="w-7 h-7 rounded-md flex-shrink-0" style={{ background: `linear-gradient(135deg, ${t.accent} 0%, ${t.accentDark} 100%)` }} />
                <span className="text-[11.5px] font-bold text-slate-200 leading-tight">{t.name}</span>
              </button>
            ))}
            {brandAccent && /^#[0-9a-fA-F]{6}$/.test(brandAccent) && (
              <button
                onClick={() => patch({ themeId: 'brand' })}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition text-left ${
                  state.themeId === 'brand' ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-800 hover:border-slate-600'
                }`}
              >
                <span className="w-7 h-7 rounded-md flex-shrink-0" style={{ background: brandAccent }} />
                <span className="text-[11.5px] font-bold text-slate-200 leading-tight">Brand accent</span>
              </button>
            )}
          </div>
        </div>

        <button
          onClick={onGenerate}
          disabled={busy || !state.businessName.trim()}
          className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-slate-950 font-bold text-sm px-5 py-3.5 rounded-xl transition"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {busy ? 'Structuring your plan…' : 'Generate the outline'}
        </button>
        <p className="text-[11px] text-slate-500 text-center">
          You review and edit the outline before any long writing starts.
        </p>
      </div>
    </div>
  );
};

export default PlanSetupPanel;
