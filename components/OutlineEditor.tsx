// ─────────────────────────────────────────────────────────────────────────────
// OutlineEditor.tsx
//
// The "Outline first" step — Gamma UX pattern.
//
// Shows the user a draft pitch deck outline (title + bullets + layout +
// copy formula + emotion + visual prompt for each slide) BEFORE full
// generation. The user can:
//   - Switch strategy (re-seeds the outline)
//   - Edit any slide's title, bullets, layout, copy formula, emotion, guidance
//   - Regenerate a single slide (AI rewrite of just that slide's text)
//   - Reorder slides (up/down arrows — no drag-drop lib needed)
//   - Add a blank slide
//   - Remove a slide
//   - Skip outline entirely ("Surprise me" → goes straight to AI-proposed full gen)
//
// When the user clicks "Generate Full Deck", the edited outline is passed to
// the existing generatePresentation() flow, which now uses the outline as
// strong structural guidance for the full Gemini call.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo } from 'react';
import {
  X, ChevronUp, ChevronDown, Trash2, Plus, RefreshCw, Sparkles,
  Wand2, Loader2, ListChecks, ArrowRight, Lightbulb, AlertTriangle,
} from 'lucide-react';
import {
  OutlineSlide, OutlineStrategy, STRATEGIES, getStrategyById,
  LAYOUTS, COPY_FORMULAS, createBlankOutlineSlide, newOutlineSlideId,
  SlideLayout, CopyFormula, Emotion, SlideRole,
} from '../utils/outlineStrategies';
import { regenerateSlide, handleGeminiError } from '../utils/outlineGenerator';

interface OutlineEditorProps {
  /** Draft outline from the AI (or seeded from a strategy). */
  initialSlides: OutlineSlide[];
  /** Strategy that produced the initial outline, if any. */
  initialStrategyId?: string;
  /** Source document name (shown in header + used for regeneration context). */
  documentName: string;
  /** Business name (used for regeneration context). */
  businessName?: string;
  /** Optional document content (used for slide regeneration). */
  documentContent?: string;
  /** Called when user clicks "Generate Full Deck" — receives the edited outline. */
  onGenerate: (slides: OutlineSlide[]) => void;
  /** Called when user clicks "Back" or closes the editor. */
  onBack: () => void;
  /** Called when user switches strategy (parent refetches outline). */
  onStrategyChange?: (strategyId: string) => void;
}

const EMOTION_OPTIONS: Emotion[] = [
  'curiosity', 'frustration', 'hope', 'confidence', 'trust', 'urgency',
  'connection', 'fear', 'relief', 'aspiration', 'clarity', 'warmth', 'celebration',
];

const ROLE_OPTIONS: SlideRole[] = [
  'hook', 'what-is', 'what-could-be', 'proof', 'evaluation', 'trust',
  'celebration', 'insight', 'interaction', 'summary', 'action', 'structure',
];

const EMOTION_COLORS: Record<Emotion, string> = {
  curiosity:     'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  frustration:   'text-red-400 bg-red-500/10 border-red-500/30',
  hope:          'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  confidence:    'text-blue-400 bg-blue-500/10 border-blue-500/30',
  trust:         'text-violet-400 bg-violet-500/10 border-violet-500/30',
  urgency:       'text-amber-400 bg-amber-500/10 border-amber-500/30',
  connection:    'text-pink-400 bg-pink-500/10 border-pink-500/30',
  fear:          'text-rose-400 bg-rose-500/10 border-rose-500/30',
  relief:        'text-teal-400 bg-teal-500/10 border-teal-500/30',
  aspiration:    'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/30',
  clarity:       'text-sky-400 bg-sky-500/10 border-sky-500/30',
  warmth:        'text-orange-400 bg-orange-500/10 border-orange-500/30',
  celebration:   'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
};

const OutlineEditor: React.FC<OutlineEditorProps> = ({
  initialSlides,
  initialStrategyId,
  documentName,
  businessName,
  documentContent,
  onGenerate,
  onBack,
  onStrategyChange,
}) => {
  const [slides, setSlides] = useState<OutlineSlide[]>(initialSlides);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | undefined>(initialStrategyId);
  const [showStrategyPanel, setShowStrategyPanel] = useState(false);

  // ─── Slide editing helpers ───────────────────────────────────────────────
  const updateSlide = (id: string, patch: Partial<OutlineSlide>) => {
    setSlides(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeSlide = (id: string) => {
    setSlides(prev => prev.filter(s => s.id !== id));
    if (expandedIdx !== null && expandedIdx >= slides.length - 1) {
      setExpandedIdx(null);
    }
  };

  const addSlide = () => {
    const newSlide = createBlankOutlineSlide();
    setSlides(prev => [...prev, newSlide]);
    setExpandedIdx(slides.length); // expand the new slide
  };

  const moveSlide = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === slides.length - 1) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    setSlides(prev => {
      const next = [...prev];
      [next[index], next[newIndex]] = [next[newIndex], next[index]];
      return next;
    });
    setExpandedIdx(newIndex);
  };

  const duplicateSlide = (id: string) => {
    const slide = slides.find(s => s.id === id);
    if (!slide) return;
    const idx = slides.findIndex(s => s.id === id);
    const dup: OutlineSlide = { ...slide, id: newOutlineSlideId(), title: `${slide.title} (copy)` };
    setSlides(prev => {
      const next = [...prev];
      next.splice(idx + 1, 0, dup);
      return next;
    });
  };

  const handleRegenerate = async (slide: OutlineSlide) => {
    setRegeneratingId(slide.id);
    try {
      const updated = await regenerateSlide(slide, {
        documentName,
        businessName,
        documentContent,
      });
      updateSlide(slide.id, updated);
    } catch (e) {
      handleGeminiError(e);
      alert('Failed to regenerate slide. Please try again.');
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleStrategySelect = (strategyId: string) => {
    // No-op if re-selecting the strategy that's already active — nothing
    // would change, so don't regenerate or prompt.
    if (strategyId === selectedStrategyId) {
      setShowStrategyPanel(false);
      return;
    }
    // FIX (2026-07-08): switching strategy re-seeds the outline from scratch
    // via onStrategyChange, which silently discards whatever's currently in
    // the slides list — including any manual edits. Confirm first so a
    // curious click doesn't wipe out real work with no way back.
    if (!window.confirm('Switching strategy will regenerate the outline and replace your current slides. Continue?')) {
      return;
    }
    setSelectedStrategyId(strategyId);
    setShowStrategyPanel(false);
    if (onStrategyChange) {
      onStrategyChange(strategyId);
    }
  };

  // ─── Derived state ────────────────────────────────────────────────────────
  const selectedStrategy = useMemo(
    () => (selectedStrategyId ? getStrategyById(selectedStrategyId) : undefined),
    [selectedStrategyId]
  );

  const canGenerate = slides.length >= 3 && slides.length <= 20;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#050510] animate-in fade-in duration-300">
      {/* ─── Top Bar ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-white/10 bg-[#0a0a1a] px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all flex-shrink-0"
            title="Back to document selection"
          >
            <ChevronUp size={18} className="rotate-90" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ListChecks size={18} className="text-cyan-400 flex-shrink-0" />
              <h2 className="text-lg font-black text-white truncate">Outline Editor</h2>
              <span className="text-xs font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-full flex-shrink-0">
                {slides.length} slides
              </span>
            </div>
            <p className="text-xs text-gray-500 truncate">
              Source: <span className="text-gray-400">{documentName}</span>
              {selectedStrategy && <> · Strategy: <span className="text-cyan-400">{selectedStrategy.name}</span></>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => setShowStrategyPanel(s => !s)}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/30 rounded-lg text-sm font-bold text-gray-300 hover:text-cyan-400 transition-all flex items-center gap-2"
          >
            <Lightbulb size={16} />
            {selectedStrategy ? 'Change Strategy' : 'Pick Strategy'}
          </button>
          <button
            onClick={() => canGenerate && onGenerate(slides)}
            disabled={!canGenerate}
            className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-purple-600/20"
          >
            <Sparkles size={16} />
            Generate Full Deck
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* ─── Strategy Picker Panel (collapsible) ──────────────────────────── */}
      {showStrategyPanel && (
        <div className="flex-shrink-0 border-b border-white/10 bg-[#0a0a1a]/80 backdrop-blur-md px-6 py-4 animate-in slide-in-from-top duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 max-h-[40vh] overflow-y-auto custom-scrollbar">
            {STRATEGIES.map(s => (
              <button
                key={s.id}
                onClick={() => handleStrategySelect(s.id)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  selectedStrategyId === s.id
                    ? 'bg-cyan-500/10 border-cyan-500/50 ring-1 ring-cyan-500/30'
                    : 'bg-white/5 border-white/10 hover:border-cyan-500/30 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-sm font-black text-white">{s.name}</h4>
                  <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">{s.slideCount}</span>
                </div>
                <p className="text-xs text-gray-400 mb-2 leading-snug">{s.description}</p>
                <p className="text-[10px] text-gray-500 leading-tight">
                  <span className="font-bold text-gray-400">Best for:</span> {s.bestFor}
                </p>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-3">
            <AlertTriangle size={11} className="inline mr-1" />
            Switching strategy will re-seed the outline. Your current edits will be lost.
          </p>
        </div>
      )}

      {/* ─── Main editor area ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* Strategy context card (if a strategy is active) */}
          {selectedStrategy && (
            <div className="mb-4 p-4 rounded-2xl bg-gradient-to-br from-cyan-500/5 to-purple-500/5 border border-cyan-500/20">
              <div className="flex items-start gap-3">
                <Lightbulb size={18} className="text-cyan-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-white mb-1">{selectedStrategy.name}</h3>
                  <p className="text-xs text-gray-400 mb-2">{selectedStrategy.description}</p>
                  <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                    <span className="text-gray-400 bg-white/5 px-2 py-1 rounded">Audience: <span className="text-white">{selectedStrategy.audience}</span></span>
                    <span className="text-gray-400 bg-white/5 px-2 py-1 rounded">Tone: <span className="text-white">{selectedStrategy.tone}</span></span>
                    <span className="text-gray-400 bg-white/5 px-2 py-1 rounded">Arc: <span className="text-white">{selectedStrategy.emotionArc}</span></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Slide cards */}
          {slides.map((slide, idx) => (
            <SlideCard
              key={slide.id}
              slide={slide}
              index={idx}
              total={slides.length}
              isExpanded={expandedIdx === idx}
              isRegenerating={regeneratingId === slide.id}
              onToggleExpand={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              onChange={(patch) => updateSlide(slide.id, patch)}
              onMoveUp={() => moveSlide(idx, 'up')}
              onMoveDown={() => moveSlide(idx, 'down')}
              onRemove={() => removeSlide(slide.id)}
              onDuplicate={() => duplicateSlide(slide.id)}
              onRegenerate={() => handleRegenerate(slide)}
            />
          ))}

          {/* Add slide button */}
          <button
            onClick={addSlide}
            className="w-full p-4 rounded-2xl border-2 border-dashed border-white/15 hover:border-cyan-500/50 text-gray-500 hover:text-cyan-400 font-bold transition-all flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            Add Slide
          </button>

          {/* Validation warnings */}
          {!canGenerate && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-bold flex items-center gap-2">
              <AlertTriangle size={16} />
              {slides.length < 3 ? `Need at least 3 slides (currently ${slides.length}).` : `Maximum 20 slides (currently ${slides.length}).`}
            </div>
          )}
        </div>
      </div>

      {/* ─── Bottom action bar ───────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-white/10 bg-[#0a0a1a] px-6 py-3 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Edit any slide title, bullets, layout, or copy formula. Click <RefreshCw size={11} className="inline mx-1" /> to AI-rewrite a single slide.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm font-bold text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => canGenerate && onGenerate(slides)}
            disabled={!canGenerate}
            className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-purple-600/20"
          >
            <Sparkles size={16} />
            Generate Full Deck
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── SlideCard sub-component ────────────────────────────────────────────────
interface SlideCardProps {
  slide: OutlineSlide;
  index: number;
  total: number;
  isExpanded: boolean;
  isRegenerating: boolean;
  onToggleExpand: () => void;
  onChange: (patch: Partial<OutlineSlide>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onRegenerate: () => void;
}

const SlideCard: React.FC<SlideCardProps> = ({
  slide, index, total, isExpanded, isRegenerating,
  onToggleExpand, onChange, onMoveUp, onMoveDown, onRemove, onDuplicate, onRegenerate,
}) => {
  return (
    <div
      className={`rounded-2xl border transition-all overflow-hidden ${
        isExpanded
          ? 'bg-white/[0.07] border-cyan-500/40 shadow-lg shadow-cyan-500/5'
          : 'bg-white/[0.03] border-white/10 hover:border-white/20'
      }`}
    >
      {/* ─── Header (always visible) ─────────────────────────────────── */}
      <div className="flex items-center gap-3 p-4">
        {/* Slide number + reorder controls */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <ChevronUp size={14} />
          </button>
          <span className="text-xs font-black text-cyan-400 w-6 text-center">{index + 1}</span>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <ChevronDown size={14} />
          </button>
        </div>

        {/* Title + meta */}
        <button
          onClick={onToggleExpand}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{slide.role}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${EMOTION_COLORS[slide.emotion]}`}>
              {slide.emotion}
            </span>
            <span className="text-[10px] font-bold text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
              {LAYOUTS[slide.layout].name}
            </span>
          </div>
          <h3 className="text-base font-bold text-white truncate">
            {slide.title || <span className="text-gray-500 italic">Untitled slide</span>}
          </h3>
          {!isExpanded && slide.bullets.length > 0 && (
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {slide.bullets.join(' · ')}
            </p>
          )}
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="p-2 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-50 transition-all"
            title="AI regenerate this slide"
          >
            {isRegenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          <button
            onClick={onDuplicate}
            className="p-2 rounded-lg text-gray-400 hover:text-violet-400 hover:bg-violet-500/10 transition-all"
            title="Duplicate slide"
          >
            <Plus size={14} className="rotate-45" />
          </button>
          <button
            onClick={onRemove}
            className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Remove slide"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* ─── Expanded editor ──────────────────────────────────────────────── */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-white/5 space-y-3 animate-in slide-in-from-top duration-200">
          {/* Title */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Slide Title</label>
            <input
              type="text"
              value={slide.title}
              onChange={e => onChange({ title: e.target.value })}
              className="w-full bg-white/5 border border-white/10 focus:border-cyan-500/50 rounded-lg px-3 py-2 text-white text-sm font-bold outline-none transition-colors"
              placeholder="Enter slide title..."
            />
          </div>

          {/* Bullets */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Bullet Points <span className="text-gray-600 normal-case font-normal">(one per line — what this slide will cover)</span>
            </label>
            <textarea
              value={slide.bullets.join('\n')}
              onChange={e => onChange({ bullets: e.target.value.split('\n').filter(b => b.length > 0) })}
              rows={3}
              className="w-full bg-white/5 border border-white/10 focus:border-cyan-500/50 rounded-lg px-3 py-2 text-gray-200 text-sm outline-none transition-colors resize-y font-mono"
              placeholder={'Bullet one\nBullet two\nBullet three'}
            />
          </div>

          {/* Dropdowns: Layout / Formula / Emotion / Role */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Layout</label>
              <select
                value={slide.layout}
                onChange={e => onChange({ layout: e.target.value as SlideLayout })}
                className="w-full bg-white/5 border border-white/10 focus:border-cyan-500/50 rounded-lg px-2 py-2 text-white text-xs outline-none transition-colors"
              >
                {(Object.keys(LAYOUTS) as SlideLayout[]).map(k => (
                  <option key={k} value={k} className="bg-[#0a0a1a]">{LAYOUTS[k].name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Copy Formula</label>
              <select
                value={slide.copyFormula}
                onChange={e => onChange({ copyFormula: e.target.value as CopyFormula })}
                className="w-full bg-white/5 border border-white/10 focus:border-cyan-500/50 rounded-lg px-2 py-2 text-white text-xs outline-none transition-colors"
              >
                {(Object.keys(COPY_FORMULAS) as CopyFormula[]).map(k => (
                  <option key={k} value={k} className="bg-[#0a0a1a]">{COPY_FORMULAS[k].name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Emotion Goal</label>
              <select
                value={slide.emotion}
                onChange={e => onChange({ emotion: e.target.value as Emotion })}
                className="w-full bg-white/5 border border-white/10 focus:border-cyan-500/50 rounded-lg px-2 py-2 text-white text-xs outline-none transition-colors"
              >
                {EMOTION_OPTIONS.map(e => (
                  <option key={e} value={e} className="bg-[#0a0a1a]">{e}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Role</label>
              <select
                value={slide.role}
                onChange={e => onChange({ role: e.target.value as SlideRole })}
                className="w-full bg-white/5 border border-white/10 focus:border-cyan-500/50 rounded-lg px-2 py-2 text-white text-xs outline-none transition-colors"
              >
                {ROLE_OPTIONS.map(r => (
                  <option key={r} value={r} className="bg-[#0a0a1a]">{r}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Selected formula hint */}
          <p className="text-[10px] text-gray-500 italic">
            <span className="font-bold text-gray-400">{COPY_FORMULAS[slide.copyFormula].name}:</span> {COPY_FORMULAS[slide.copyFormula].template}
          </p>

          {/* Visual prompt */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Visual Prompt <span className="text-gray-600 normal-case font-normal">(image/chart description for AI generation)</span>
            </label>
            <input
              type="text"
              value={slide.visualPrompt || ''}
              onChange={e => onChange({ visualPrompt: e.target.value })}
              className="w-full bg-white/5 border border-white/10 focus:border-cyan-500/50 rounded-lg px-3 py-2 text-gray-300 text-sm outline-none transition-colors"
              placeholder="e.g. Heroic brand illustration with SA flag accent"
            />
          </div>

          {/* Guidance */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
              Guidance <span className="text-gray-600 normal-case font-normal">(hint for AI when generating full content)</span>
            </label>
            <textarea
              value={slide.guidance}
              onChange={e => onChange({ guidance: e.target.value })}
              rows={2}
              className="w-full bg-white/5 border border-white/10 focus:border-cyan-500/50 rounded-lg px-3 py-2 text-gray-300 text-sm outline-none transition-colors resize-y"
              placeholder="What should this slide accomplish?"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default OutlineEditor;
