// components/businessPlan/PlanEditorPanel.tsx
/**
 * StacFund — Business Plan Studio: editor side panel
 * ==================================================
 * Right-hand panel of the editor step. Two modes:
 *   - METa mode: cover page fields (business name, tagline, contacts…)
 *   - SUBSECTION mode: per-block editors + AI rewrite
 *
 * Every AI-written word is editable; blocks can be reordered or deleted.
 */
import React, { useState } from 'react';
import { Loader2, Sparkles, Trash2, ChevronUp, ChevronDown, FileText, Type, ShieldCheck } from 'lucide-react';
import type { PlanBlock, PlanDocument, PlanMeta, PlanSubsection } from '../../services/businessPlan/planSchema';
import { subsectionWordCount } from '../../services/businessPlan/planSchema';

export interface PlanEditorPanelProps {
  mode: 'meta' | 'subsection';
  meta: PlanMeta;
  subsection: PlanSubsection | null;
  chapterTitle: string;
  rewriteBusy: boolean;
  onPatchMeta: (patch: Partial<PlanMeta>) => void;
  onPatchSubsection: (id: string, patch: Partial<PlanSubsection>) => void;
  onPatchBlock: (subId: string, blockId: string, patch: Partial<PlanBlock>) => void;
  onDeleteBlock: (subId: string, blockId: string) => void;
  onMoveBlock: (subId: string, blockId: string, dir: -1 | 1) => void;
  onRewrite: (subId: string, instruction?: string) => void;
}

const labelCls = 'block text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] mb-1.5';
const inputCls =
  'w-full bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 transition';
const areaCls = `${inputCls} min-h-[72px] resize-y leading-relaxed`;

// ─── Small helpers ───────────────────────────────────────────────────────────

const linesToText = (items: string[] | undefined): string => (items || []).join('\n');
const textToLines = (t: string): string[] => t.split('\n').map((l) => l.trim()).filter(Boolean);

const rowsToText = (rows: { k: string; v: string }[] | undefined): string =>
  (rows || []).map((r) => `${r.k} | ${r.v}`).join('\n');
const textToRows = (t: string): { k: string; v: string }[] =>
  textToLines(t).map((l) => {
    const idx = l.indexOf('|');
    return idx === -1 ? { k: l, v: '' } : { k: l.slice(0, idx).trim(), v: l.slice(idx + 1).trim() };
  });

const tableToText = (t: { columns: string[]; rows: string[][] } | undefined): string => {
  if (!t) return '';
  return [t.columns.join(' | '), ...t.rows.map((r) => r.join(' | '))].join('\n');
};
const textToTable = (text: string): { columns: string[]; rows: string[][] } => {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const parsed = lines.map((l) => l.split('|').map((c) => c.trim()));
  if (!parsed.length) return { columns: ['Column 1'], rows: [] };
  return { columns: parsed[0], rows: parsed.slice(1).filter((r) => r.length) };
};

// ─── Block editor ────────────────────────────────────────────────────────────

const BlockEditor: React.FC<{
  block: PlanBlock;
  onPatch: (patch: Partial<PlanBlock>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}> = ({ block: b, onPatch, onDelete, onMove }) => {
  const typeLabel: Record<string, string> = {
    paragraph: 'Paragraph', heading: 'Heading', callout: 'Highlight box', bullets: 'Bullet list',
    twoCol: 'Two columns', stats: 'Stat chips', table: 'Table', swot: 'SWOT grid',
    kv: 'Key/value panel', chart: 'Chart', sources: 'Sources',
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-400">{typeLabel[b.type] || b.type}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => onMove(-1)} className="p-1 text-slate-500 hover:text-white transition" title="Move up"><ChevronUp size={11} /></button>
          <button onClick={() => onMove(1)} className="p-1 text-slate-500 hover:text-white transition" title="Move down"><ChevronDown size={11} /></button>
          <button onClick={onDelete} className="p-1 text-slate-500 hover:text-red-400 transition" title="Delete block"><Trash2 size={11} /></button>
        </div>
      </div>

      {(b.type === 'paragraph' || b.type === 'heading' || b.type === 'callout') && (
        <textarea
          className={b.type === 'paragraph' ? `${areaCls} min-h-[96px]` : areaCls}
          value={b.text || ''}
          onChange={(e) => onPatch({ text: e.target.value })}
        />
      )}

      {b.type === 'bullets' && (
        <div className="space-y-2">
          <input className={inputCls} value={b.title || ''} onChange={(e) => onPatch({ title: e.target.value })} placeholder="List title (optional)" />
          <textarea className={areaCls} value={linesToText(b.items)} onChange={(e) => onPatch({ items: textToLines(e.target.value) })} placeholder="One bullet per line" />
        </div>
      )}

      {b.type === 'sources' && (
        <textarea className={areaCls} value={linesToText(b.items)} onChange={(e) => onPatch({ items: textToLines(e.target.value) })} placeholder="One source per line" />
      )}

      {b.type === 'callout' && null}

      {b.type === 'twoCol' && (
        <div className="space-y-2">
          {(['left', 'right'] as const).map((side) => (
            <div key={side} className="space-y-1.5">
              <input
                className={inputCls}
                value={b[side]?.title || ''}
                onChange={(e) => onPatch({ [side]: { title: e.target.value, items: b[side]?.items || [] } } as Partial<PlanBlock>)}
                placeholder={side === 'left' ? 'Left column title' : 'Right column title'}
              />
              <textarea
                className={`${areaCls} min-h-[64px]`}
                value={linesToText(b[side]?.items)}
                onChange={(e) => onPatch({ [side]: { title: b[side]?.title || '', items: textToLines(e.target.value) } } as Partial<PlanBlock>)}
                placeholder="One item per line"
              />
            </div>
          ))}
        </div>
      )}

      {b.type === 'stats' && (
        <div className="space-y-2">
          {(b.stats || []).map((s, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={`${inputCls} w-24 font-bold`}
                value={s.value}
                onChange={(e) => {
                  const next = [...(b.stats || [])];
                  next[i] = { ...s, value: e.target.value };
                  onPatch({ stats: next });
                }}
                placeholder="R1.2m"
              />
              <input
                className={inputCls}
                value={s.label}
                onChange={(e) => {
                  const next = [...(b.stats || [])];
                  next[i] = { ...s, label: e.target.value };
                  onPatch({ stats: next });
                }}
                placeholder="What it means"
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={() => onPatch({ stats: [...(b.stats || []), { value: '', label: '' }] })}
              className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300"
            >+ chip</button>
            {(b.stats || []).length > 1 && (
              <button
                onClick={() => onPatch({ stats: (b.stats || []).slice(0, -1) })}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-300"
              >− chip</button>
            )}
          </div>
        </div>
      )}

      {b.type === 'table' && (
        <div className="space-y-2">
          <input className={inputCls} value={b.table?.caption || ''} onChange={(e) => onPatch({ table: { ...(b.table || { columns: [], rows: [] }), caption: e.target.value } })} placeholder="Table caption (optional)" />
          <textarea
            className={`${areaCls} font-mono text-[12px]`}
            value={tableToText(b.table)}
            onChange={(e) => onPatch({ table: { ...(b.table || { columns: [], rows: [] }), ...textToTable(e.target.value) } })}
            placeholder={'Header 1 | Header 2 | Header 3\nCell | Cell | Cell'}
          />
          <p className="text-[10px] text-slate-500">First line = header row. Separate cells with |</p>
        </div>
      )}

      {b.type === 'swot' && (
        <div className="space-y-2">
          {(['strengths', 'weaknesses', 'opportunities', 'threats'] as const).map((k) => (
            <div key={k}>
              <span className={labelCls}>{k}</span>
              <textarea
                className={`${areaCls} min-h-[52px]`}
                value={linesToText(b.swot?.[k])}
                onChange={(e) => onPatch({ swot: { ...(b.swot as NonNullable<PlanBlock['swot']>), [k]: textToLines(e.target.value) } })}
              />
            </div>
          ))}
        </div>
      )}

      {b.type === 'kv' && (
        <div className="space-y-2">
          <input className={inputCls} value={b.kv?.title || ''} onChange={(e) => onPatch({ kv: { ...(b.kv || { rows: [] }), title: e.target.value } })} placeholder="Panel title (optional)" />
          <textarea
            className={`${areaCls} font-mono text-[12px]`}
            value={rowsToText(b.kv?.rows)}
            onChange={(e) => onPatch({ kv: { ...(b.kv || { rows: [] }), rows: textToRows(e.target.value) } })}
            placeholder={'Key | Value\nKey | Value'}
          />
          <p className="text-[10px] text-slate-500">One row per line: Key | Value</p>
        </div>
      )}

      {b.type === 'chart' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input className={inputCls} value={b.chart?.title || ''} onChange={(e) => onPatch({ chart: { ...(b.chart as NonNullable<PlanBlock['chart']>), title: e.target.value } })} placeholder="Chart title" />
            <select
              className={`${inputCls} w-28`}
              value={b.chart?.kind || 'bar'}
              onChange={(e) => onPatch({ chart: { ...(b.chart as NonNullable<PlanBlock['chart']>), kind: e.target.value as 'bar' | 'line' | 'donut' } })}
            >
              <option value="bar">Bar</option>
              <option value="line">Line</option>
              <option value="donut">Donut</option>
            </select>
          </div>
          <textarea
            className={`${areaCls} font-mono text-[12px]`}
            value={(b.chart?.points || []).map((p) => `${p.label} ${p.value}`).join('\n')}
            onChange={(e) => onPatch({
              chart: {
                ...(b.chart as NonNullable<PlanBlock['chart']>),
                points: textToLines(e.target.value).map((l) => {
                  const parts = l.split(/\s+/);
                  const value = Number(parts.pop() || 0);
                  return { label: parts.join(' '), value };
                }),
              },
            })}
            placeholder={'Year 1 450000\nYear 2 900000'}
          />
          <p className="text-[10px] text-slate-500">One point per line: Label value</p>
        </div>
      )}
    </div>
  );
};

// ─── Panel ───────────────────────────────────────────────────────────────────

const PlanEditorPanel: React.FC<PlanEditorPanelProps> = ({
  mode, meta, subsection, chapterTitle, rewriteBusy,
  onPatchMeta, onPatchSubsection, onPatchBlock, onDeleteBlock, onMoveBlock, onRewrite,
}) => {
  const [rewriteInstruction, setRewriteInstruction] = useState('');

  if (mode === 'meta') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <FileText size={14} className="text-emerald-400" />
          <span className="text-sm font-bold text-white">Cover page</span>
        </div>
        <div><label className={labelCls}>Business name</label>
          <input className={inputCls} value={meta.businessName} onChange={(e) => onPatchMeta({ businessName: e.target.value })} /></div>
        <div><label className={labelCls}>Document title</label>
          <input className={inputCls} value={meta.planTitle} onChange={(e) => onPatchMeta({ planTitle: e.target.value })} /></div>
        <div><label className={labelCls}>Tagline</label>
          <input className={inputCls} value={meta.tagline} onChange={(e) => onPatchMeta({ tagline: e.target.value })} placeholder="One line under the title" /></div>
        <div><label className={labelCls}>Prepared for</label>
          <input className={inputCls} value={meta.preparedFor} onChange={(e) => onPatchMeta({ preparedFor: e.target.value })} /></div>
        <div><label className={labelCls}>Prepared by</label>
          <input className={inputCls} value={meta.preparedBy} onChange={(e) => onPatchMeta({ preparedBy: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelCls}>Email</label>
            <input className={inputCls} value={meta.contactEmail} onChange={(e) => onPatchMeta({ contactEmail: e.target.value })} /></div>
          <div><label className={labelCls}>Phone</label>
            <input className={inputCls} value={meta.contactPhone} onChange={(e) => onPatchMeta({ contactPhone: e.target.value })} /></div>
        </div>
        <div><label className={labelCls}>Website</label>
          <input className={inputCls} value={meta.contactWebsite} onChange={(e) => onPatchMeta({ contactWebsite: e.target.value })} /></div>
        <div><label className={labelCls}>Address</label>
          <input className={inputCls} value={meta.contactAddress} onChange={(e) => onPatchMeta({ contactAddress: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelCls}>Date label</label>
            <input className={inputCls} value={meta.dateLabel} onChange={(e) => onPatchMeta({ dateLabel: e.target.value })} /></div>
          <div><label className={labelCls}>Amount label</label>
            <input className={inputCls} value={meta.requestedAmountLabel} onChange={(e) => onPatchMeta({ requestedAmountLabel: e.target.value })} /></div>
        </div>
      </div>
    );
  }

  if (!subsection) {
    return <div className="text-sm text-slate-500 py-8 text-center">Select a section to edit it.</div>;
  }

  const words = subsectionWordCount(subsection);
  const pct = Math.min(160, Math.round((words / Math.max(1, subsection.targetWords)) * 100));

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{chapterTitle}</span>
          <span className={`text-[10px] font-bold ${pct < 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {words} / {subsection.targetWords} words
          </span>
        </div>
        <input
          className={`${inputCls} text-[15px] font-bold`}
          value={subsection.title}
          onChange={(e) => onPatchSubsection(subsection.id, { title: e.target.value })}
        />
      </div>

      {/* AI rewrite — hidden for deterministic sections (real data, not prose) */}
      {subsection.deterministic ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 flex items-start gap-2">
          <ShieldCheck size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />
          <span className="text-[11px] text-slate-400 leading-relaxed">
            This section is generated from your real data (funding-needs register or funder requirements) — the figures are never AI-rewritten.
            Edit the blocks below directly, or update the source data in your profile / Needs tab.
          </span>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={13} className="text-emerald-400" />
            <span className="text-xs font-bold text-emerald-300">Rewrite this section with AI</span>
          </div>
          <textarea
            className={`${inputCls} min-h-[54px] text-[12.5px]`}
            value={rewriteInstruction}
            onChange={(e) => setRewriteInstruction(e.target.value)}
            placeholder="Optional: what to change — e.g. 'make the pricing more conservative', 'add a paragraph on SARS compliance'…"
          />
          <button
            onClick={() => onRewrite(subsection.id, rewriteInstruction.trim() || undefined)}
            disabled={rewriteBusy}
            className="mt-2 w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-bold text-xs py-2.5 rounded-lg transition"
          >
            {rewriteBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {rewriteBusy ? 'Rewriting…' : 'Rewrite section'}
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <Type size={11} />
        <span>{subsection.blocks.length} block{subsection.blocks.length === 1 ? '' : 's'} — edit, reorder or delete</span>
      </div>

      <div className="space-y-3">
        {subsection.blocks.map((b) => (
          <BlockEditor
            key={b.id}
            block={b}
            onPatch={(patch) => onPatchBlock(subsection.id, b.id, patch)}
            onDelete={() => onDeleteBlock(subsection.id, b.id)}
            onMove={(dir) => onMoveBlock(subsection.id, b.id, dir)}
          />
        ))}
        {!subsection.blocks.length && (
          <div className="text-center text-xs text-slate-500 py-6 border border-dashed border-slate-800 rounded-lg">
            No content yet — use Rewrite to generate it.
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanEditorPanel;
