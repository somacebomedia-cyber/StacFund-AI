import React, { useState } from 'react';
import { 
  ArrowUp, ArrowDown, Trash2, Copy, Plus, RefreshCw, Sparkles, Check, 
  ArrowLeft, Layout, Edit3, MessageSquare, Heart, ShieldCheck, ChevronRight, Loader2 
} from 'lucide-react';
import { SlideOutline, PITCH_STRATEGIES, LAYOUT_TEMPLATES, COPY_FORMULAS } from '../utils/outlineStrategies';
import { regenerateSingleSlide } from '../utils/outlineGenerator';

interface OutlineEditorProps {
  businessName: string;
  docName: string;
  docContent: string;
  initialOutline: SlideOutline[];
  onGenerate: (finalOutline: SlideOutline[]) => void;
  onBack: () => void;
  onStrategyChange: (strategyId: string) => Promise<void>;
  currentStrategyId: string;
}

export const OutlineEditor: React.FC<OutlineEditorProps> = ({
  businessName,
  docName,
  docContent,
  initialOutline,
  onGenerate,
  onBack,
  onStrategyChange,
  currentStrategyId
}) => {
  const [outline, setOutline] = useState<SlideOutline[]>(initialOutline);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(
    initialOutline.length > 0 ? initialOutline[0].id : null
  );
  const [isChangingStrategy, setIsChangingStrategy] = useState(false);
  const [regeneratingSlideId, setRegeneratingSlideId] = useState<string | null>(null);

  const selectedSlide = outline.find(s => s.id === selectedSlideId) || outline[0];

  const handleStrategySelect = async (strategyId: string) => {
    setIsChangingStrategy(true);
    try {
      await onStrategyChange(strategyId);
    } catch (e) {
      alert("Failed to change strategy.");
    } finally {
      setIsChangingStrategy(false);
    }
  };

  // Sync state if initialOutline changes externally
  React.useEffect(() => {
    setOutline(initialOutline);
    if (initialOutline.length > 0) {
      setSelectedSlideId(initialOutline[0].id);
    }
  }, [initialOutline]);

  // Handle slide field updates
  const updateSlideField = (id: string, field: keyof SlideOutline, value: any) => {
    setOutline(prev => prev.map(slide => 
      slide.id === id ? { ...slide, [field]: value } : slide
    ));
  };

  const handlePointChange = (slideId: string, pointIndex: number, text: string) => {
    setOutline(prev => prev.map(slide => {
      if (slide.id === slideId) {
        const newPoints = [...slide.points];
        newPoints[pointIndex] = text;
        return { ...slide, points: newPoints };
      }
      return slide;
    }));
  };

  const addPoint = (slideId: string) => {
    setOutline(prev => prev.map(slide => {
      if (slide.id === slideId) {
        return { ...slide, points: [...slide.points, 'New bullet point'] };
      }
      return slide;
    }));
  };

  const removePoint = (slideId: string, pointIndex: number) => {
    setOutline(prev => prev.map(slide => {
      if (slide.id === slideId) {
        const newPoints = slide.points.filter((_, idx) => idx !== pointIndex);
        return { ...slide, points: newPoints };
      }
      return slide;
    }));
  };

  // Reordering & slide actions
  const moveSlide = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= outline.length) return;

    const newOutline = [...outline];
    const temp = newOutline[index];
    newOutline[index] = newOutline[targetIndex];
    newOutline[targetIndex] = temp;
    setOutline(newOutline);
  };

  const duplicateSlide = (index: number) => {
    const slideToCopy = outline[index];
    const duplicated: SlideOutline = {
      ...slideToCopy,
      id: `slide_dup_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      title: `${slideToCopy.title} (Copy)`
    };
    const newOutline = [...outline];
    newOutline.splice(index + 1, 0, duplicated);
    setOutline(newOutline);
    setSelectedSlideId(duplicated.id);
  };

  const deleteSlide = (index: number) => {
    if (outline.length <= 1) {
      alert("A pitch deck must have at least 1 slide!");
      return;
    }
    const slideToDelete = outline[index];
    const newOutline = outline.filter((_, idx) => idx !== index);
    setOutline(newOutline);
    
    // Adjust selected slide
    if (selectedSlideId === slideToDelete.id) {
      const nextSelected = newOutline[Math.min(index, newOutline.length - 1)];
      setSelectedSlideId(nextSelected.id);
    }
  };

  const addBlankSlide = () => {
    const newSlide: SlideOutline = {
      id: `slide_blank_${Date.now()}`,
      title: 'New Slide',
      type: 'content',
      layout: 'solution-grid',
      copyFormula: 'Features to Benefits Mapping',
      emotion: 'Confident & Professional',
      role: 'Expand on offering details',
      points: ['Point 1 description', 'Point 2 description'],
      visualPrompt: 'Minimalist flat vector icon representing modern corporate growth'
    };
    setOutline(prev => [...prev, newSlide]);
    setSelectedSlideId(newSlide.id);
  };

  const handleAISingleRegenerate = async (slide: SlideOutline) => {
    setRegeneratingSlideId(slide.id);
    try {
      const regenerated = await regenerateSingleSlide(slide, docContent, businessName);
      setOutline(prev => prev.map(s => s.id === slide.id ? regenerated : s));
    } catch (e) {
      alert("Failed to regenerate slide content. Please try again.");
    } finally {
      setRegeneratingSlideId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#03030d] text-white">
      {/* Top Header */}
      <div className="h-16 px-6 border-b border-white/10 flex items-center justify-between bg-black/40 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <span className="text-xs text-cyan-400 font-bold uppercase tracking-widest">Phase 2: Review Deck Outline</span>
            <h1 className="text-sm font-black text-gray-200">Structuring Pitch for "{businessName}" based on "{docName}"</h1>
          </div>
        </div>

        <button
          onClick={() => onGenerate(outline)}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black rounded-xl text-sm transition-all shadow-lg shadow-cyan-500/20 active:scale-95"
        >
          <Check size={16} /> Generate Full Deck
        </button>
      </div>

      {/* Main Workspace split */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {/* Left Sidebar: Strategy & Navigation */}
        <div className="w-80 border-r border-white/10 flex flex-col h-full bg-black/20 shrink-0 overflow-y-auto custom-scrollbar p-5">
          <div className="mb-6">
            <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
              <Sparkles size={14} className="text-cyan-400" /> Pitch Strategy
            </h2>
            <select
              value={currentStrategyId}
              disabled={isChangingStrategy}
              onChange={(e) => handleStrategySelect(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white font-medium focus:border-cyan-500 outline-none transition-all cursor-pointer"
            >
              {PITCH_STRATEGIES.map(strat => (
                <option key={strat.id} value={strat.id} className="bg-[#050510] text-white">
                  {strat.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-2 italic leading-relaxed">
              {PITCH_STRATEGIES.find(s => s.id === currentStrategyId)?.description}
            </p>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Layout size={14} className="text-cyan-400" /> Slide List ({outline.length})
              </h2>
              <button 
                onClick={addBlankSlide}
                className="p-1 px-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all text-cyan-400"
              >
                <Plus size={10} /> Add Blank
              </button>
            </div>

            {isChangingStrategy ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12">
                <Loader2 size={32} className="animate-spin text-cyan-400 mb-2" />
                <p className="text-xs text-gray-500">Regenerating draft...</p>
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto flex-1 pr-1 custom-scrollbar">
                {outline.map((slide, idx) => (
                  <div 
                    key={slide.id}
                    onClick={() => setSelectedSlideId(slide.id)}
                    className={`group w-full p-3 rounded-xl border text-left transition-all relative cursor-pointer ${
                      selectedSlideId === slide.id 
                        ? 'bg-white/10 border-cyan-500/50 text-white' 
                        : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="truncate pr-12">
                        <span className="text-[9px] font-black uppercase tracking-wider opacity-60">
                          {idx + 1} • {slide.type}
                        </span>
                        <h4 className="text-xs font-bold truncate mt-0.5">{slide.title}</h4>
                        <span className="text-[9px] text-gray-500 block truncate font-mono">{slide.layout}</span>
                      </div>
                      
                      {/* Control Pill (Hover actions) */}
                      <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1 bg-black/60 p-1 rounded-lg border border-white/10">
                        <button 
                          onClick={(e) => { e.stopPropagation(); moveSlide(idx, 'up'); }}
                          disabled={idx === 0}
                          className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
                          title="Move Up"
                        >
                          <ArrowUp size={10} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); moveSlide(idx, 'down'); }}
                          disabled={idx === outline.length - 1}
                          className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
                          title="Move Down"
                        >
                          <ArrowDown size={10} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); duplicateSlide(idx); }}
                          className="p-1 text-gray-400 hover:text-cyan-400"
                          title="Duplicate"
                        >
                          <Copy size={10} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteSlide(idx); }}
                          className="p-1 text-gray-400 hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Area: Core Selected Slide Editor */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 flex justify-center bg-[#060613]">
          {selectedSlide ? (
            <div className="w-full max-w-3xl space-y-8 bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-xl self-start">
              <div className="flex justify-between items-start border-b border-white/10 pb-6">
                <div>
                  <div className="flex items-center gap-2 text-xs text-cyan-400 font-black uppercase tracking-wider mb-1">
                    <Edit3 size={14} /> Slide Customization
                  </div>
                  <h3 className="text-xl font-black text-white">Refine Details & Bullet Content</h3>
                </div>

                <button
                  onClick={() => handleAISingleRegenerate(selectedSlide)}
                  disabled={regeneratingSlideId !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-400 hover:text-purple-300 font-bold rounded-xl text-xs transition-colors disabled:opacity-50"
                  title="Re-roll only this slide content with AI"
                >
                  <RefreshCw size={12} className={regeneratingSlideId === selectedSlide.id ? 'animate-spin' : ''} />
                  {regeneratingSlideId === selectedSlide.id ? 'Regenerating...' : 'AI Re-Roll'}
                </button>
              </div>

              {/* Editable Fields Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* Slide Title */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-400">Slide Heading Title</label>
                  <input
                    type="text"
                    value={selectedSlide.title}
                    onChange={(e) => updateSlideField(selectedSlide.id, 'title', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-cyan-500 outline-none rounded-xl p-3 text-sm font-bold transition-all"
                  />
                </div>

                {/* Slide Type */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-400">Slide Type</label>
                  <select
                    value={selectedSlide.type}
                    onChange={(e) => updateSlideField(selectedSlide.id, 'type', e.target.value)}
                    className="w-full bg-[#050510] border border-white/10 rounded-xl p-3 text-sm font-medium focus:border-cyan-500 outline-none"
                  >
                    <option value="cover">Cover / Splash</option>
                    <option value="content">Content Bullets</option>
                    <option value="data">Data / Metrics Chart</option>
                    <option value="quote">Testimonial Quote</option>
                  </select>
                </div>

                {/* Layout Template */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-400">Structural Layout</label>
                  <select
                    value={selectedSlide.layout}
                    onChange={(e) => updateSlideField(selectedSlide.id, 'layout', e.target.value)}
                    className="w-full bg-[#050510] border border-white/10 rounded-xl p-3 text-sm font-medium focus:border-cyan-500 outline-none"
                  >
                    {LAYOUT_TEMPLATES.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                {/* Copy Formula */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-400">Copywriting Formula</label>
                  <select
                    value={selectedSlide.copyFormula}
                    onChange={(e) => updateSlideField(selectedSlide.id, 'copyFormula', e.target.value)}
                    className="w-full bg-[#050510] border border-white/10 rounded-xl p-3 text-sm font-medium focus:border-cyan-500 outline-none"
                  >
                    {COPY_FORMULAS.map(cf => (
                      <option key={cf.name} value={cf.name}>{cf.name}</option>
                    ))}
                  </select>
                </div>

                {/* Emotional Tone */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-400">Emotional Tone</label>
                  <input
                    type="text"
                    value={selectedSlide.emotion}
                    onChange={(e) => updateSlideField(selectedSlide.id, 'emotion', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 focus:border-cyan-500 outline-none rounded-xl p-3 text-sm font-medium transition-all"
                  />
                </div>

                {/* Slide Role */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-400">Slide Role / Purpose</label>
                  <input
                    type="text"
                    value={selectedSlide.role}
                    onChange={(e) => updateSlideField(selectedSlide.id, 'role', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 focus:border-cyan-500 outline-none rounded-xl p-3 text-sm font-medium transition-all"
                  />
                </div>

                {/* Visual Generator Prompt */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-400">Visual Generator Prompt (AI / Stock query)</label>
                  <textarea
                    value={selectedSlide.visualPrompt}
                    rows={2}
                    onChange={(e) => updateSlideField(selectedSlide.id, 'visualPrompt', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 focus:border-cyan-500 outline-none rounded-xl p-3 text-sm font-medium transition-all custom-scrollbar resize-none"
                  />
                </div>

                {/* Bullet Points Section */}
                <div className="md:col-span-2 space-y-3 pt-4 border-t border-white/10">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-black uppercase tracking-wider text-cyan-400">
                      {selectedSlide.type === 'cover' ? 'Value Proposition text' : selectedSlide.type === 'data' ? 'Metrics Stats (Value:Label format)' : 'Slide Content Bullets'}
                    </label>
                    <button
                      onClick={() => addPoint(selectedSlide.id)}
                      className="p-1 px-2 text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-bold flex items-center gap-1 text-cyan-400 transition-colors"
                    >
                      <Plus size={10} /> Add Item
                    </button>
                  </div>

                  <div className="space-y-2">
                    {selectedSlide.points.map((pt, pIdx) => (
                      <div key={pIdx} className="flex items-center gap-3">
                        <div className="text-xs font-mono text-gray-500 w-4">{pIdx + 1}.</div>
                        <input
                          type="text"
                          value={pt}
                          onChange={(e) => handlePointChange(selectedSlide.id, pIdx, e.target.value)}
                          placeholder={selectedSlide.type === 'data' ? 'e.g. R500k:Revenue' : 'e.g. Bullet details'}
                          className="flex-1 bg-white/5 border border-white/10 focus:border-cyan-500 outline-none rounded-xl p-2.5 text-xs font-medium transition-all"
                        />
                        <button
                          onClick={() => removePoint(selectedSlide.id, pIdx)}
                          className="p-2 text-gray-500 hover:text-red-400 hover:bg-white/5 rounded-xl transition-all"
                          title="Remove Bullet"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {selectedSlide.points.length === 0 && (
                      <p className="text-xs text-gray-500 italic py-4 text-center">No bullets added yet. Click "Add Item" above.</p>
                    )}
                  </div>
                </div>

              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-500">
              <Layout size={48} className="mb-4 text-gray-600" />
              <p>Select a slide from the sidebar to edit</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
