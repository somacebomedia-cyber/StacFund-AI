import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Layout, Image as ImageIcon, Download, ChevronLeft, ChevronRight, Palette, Wand2, Loader2, Printer, Type as TypeIcon, PieChart, ListChecks, Video } from 'lucide-react';
import { Type } from '@google/genai';
import { createGeminiClient } from '../services/geminiClient';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { handleGeminiError } from '../services/geminiError';
import { User, AppDocument } from '../types';
import OutlineEditor from './OutlineEditor';
import { generateOutline, handleGeminiError as outlineHandleGeminiError } from '../utils/outlineGenerator';
import { OutlineSlide, OutlineStrategy, getStrategyById, getDefaultStrategy, STRATEGIES } from '../utils/outlineStrategies';
import { generateSlideImage as orchestratorGenerateImage, deriveStockSearchQuery, getImageSourceModeLabel, getImageSourceModeDescription, type ImageSourceMode, type ImageAttribution } from '../utils/imageOrchestrator';
import { el } from '../utils/elementTypes';
import { exportSlidesToVideo, isVideoExportSupported, downloadVideoBlob, paintElementToCanvas, type VideoExportOptions } from '../utils/videoExporter';

interface PresentationDesignerProps {
  user: User | null;
  onClose: () => void;
}

interface Slide {
  id: string;
  type: 'cover' | 'content' | 'data' | 'quote';
  title: string;
  points: string[];
  visualPrompt?: string; 
  imageData?: string;
  isGeneratingImage?: boolean;
  // Attribution metadata for stock photos (Pexels/Pixabay). Undefined for
  // AI-generated images. Required for legal compliance with stock photo licenses.
  imageAttribution?: ImageAttribution;
  // Which source produced this slide's image. Used to show a badge in the editor.
  imageSource?: 'ai' | 'pexels' | 'pixabay';
}

// ─── PITCH DECK THEME SYSTEM ─────────────────────────────────────────
// Each theme defines the visual identity for a pitch deck. The `gradient`
// field (if present) is used as an inline CSS background on the slide,
// overriding the flat `bg` Tailwind class. This lets us do vibrant
// multi-stop gradients like the Gamma-style purple.
//
// Themes are designed for specific use cases:
//   - gamma-purple:    Default investor pitch (matches PitchDeckDocument)
//   - eco-printer:     For EcoTank/sustainability pitches (earthy green)
//   - ride-on-cars:    For kids' EV racer / preschool pitches (warm orange)
//   - ocean-blue:      For professional/corporate pitches (calm blue)
//   - sunset-pink:     For creative/lifestyle pitches (warm pink)
//   - modern-dark:     Minimal dark (original "modern")
//   - bold-magenta:    Bold magenta (original "bold")
const THEMES = [
  { id: 'gamma-purple', name: 'Gamma Purple', bg: 'bg-[#3B0764]', accent: 'text-[#A3E635]', border: 'border-[#A3E635]/30', font: 'font-sans', graphColor: '#A3E635', gradient: 'linear-gradient(135deg, #3B0764 0%, #6D28D9 50%, #9333EA 100%)', swatch: ['#3B0764', '#6D28D9', '#A3E635'] },
  { id: 'eco-printer', name: 'Eco Printer', bg: 'bg-[#064E3B]', accent: 'text-[#34D399]', border: 'border-emerald-500/30', font: 'font-serif', graphColor: '#34D399', gradient: 'linear-gradient(135deg, #064E3B 0%, #065F46 50%, #047857 100%)', swatch: ['#064E3B', '#065F46', '#34D399'] },
  { id: 'ride-on-cars', name: 'Ride-On Cars', bg: 'bg-[#7C2D12]', accent: 'text-[#FBBF24]', border: 'border-amber-500/30', font: 'font-sans', graphColor: '#F97316', gradient: 'linear-gradient(135deg, #7C2D12 0%, #EA580C 50%, #F97316 100%)', swatch: ['#7C2D12', '#EA580C', '#FBBF24'] },
  { id: 'ocean-blue', name: 'Ocean Blue', bg: 'bg-[#0C4A6E]', accent: 'text-[#38BDF8]', border: 'border-sky-500/30', font: 'font-sans', graphColor: '#38BDF8', gradient: 'linear-gradient(135deg, #0C4A6E 0%, #0369A1 50%, #0284C7 100%)', swatch: ['#0C4A6E', '#0369A1', '#38BDF8'] },
  { id: 'sunset-pink', name: 'Sunset Pink', bg: 'bg-[#831843]', accent: 'text-[#FCD34D]', border: 'border-pink-500/30', font: 'font-sans', graphColor: '#DB2777', gradient: 'linear-gradient(135deg, #831843 0%, #BE185D 50%, #DB2777 100%)', swatch: ['#831843', '#BE185D', '#FCD34D'] },
  { id: 'modern-dark', name: 'Modern Dark', bg: 'bg-[#0a0a1a]', accent: 'text-cyan-400', border: 'border-cyan-500/30', font: 'font-sans', graphColor: '#22d3ee', gradient: 'linear-gradient(135deg, #0a0a1a 0%, #1e293b 50%, #22d3ee 100%)', swatch: ['#0a0a1a', '#1e293b', '#22d3ee'] },
  { id: 'bold-magenta', name: 'Bold Magenta', bg: 'bg-[#1a051a]', accent: 'text-purple-400', border: 'border-purple-500/30', font: 'font-sans', graphColor: '#a855f7', gradient: 'linear-gradient(135deg, #1a051a 0%, #581c87 50%, #a855f7 100%)', swatch: ['#1a051a', '#581c87', '#a855f7'] },
];

// Helper to render slide content (used for both Editor and Print view)
// Marked with `data-element-type` attributes so export tools can walk the DOM
// semantically (matches the PitchDeckDocument tagging pattern).
const SlideRenderer = ({ slide, theme, index, total }: { slide: Slide, theme: typeof THEMES[0], index: number, total: number }) => (
  <div
    {...el('container-slide')}
    className={`w-full h-full ${theme.bg} relative overflow-hidden flex flex-col p-8 md:p-16 border-4 ${theme.border}`}
    style={theme.gradient ? { background: theme.gradient } : undefined}
  >
      {/* Background Pattern */}
      <div {...el('decorative-bg')} className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
      
      {/* Slide Content */}
      {slide.type === 'cover' ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center relative z-10">
            {slide.imageData ? (
              <div className="absolute inset-0 opacity-50 mix-blend-screen">
                <img src={slide.imageData} alt="Generated Visual" className="w-full h-full object-cover" />
                <div className={`absolute inset-0 bg-gradient-to-t from-[${theme.bg.replace('bg-', '')}] via-transparent to-transparent`}></div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center opacity-5">
                <ImageIcon size={300} />
              </div>
            )}
            <div className="relative z-20 max-w-3xl">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-8`}>
                <Sparkles size={16} className={theme.accent} />
                <span className="text-sm font-bold uppercase tracking-widest text-white">Business Proposal</span>
              </div>
              <h1 {...el('heading-title')} className="text-6xl md:text-7xl font-black mb-8 leading-tight text-white drop-shadow-2xl" style={{ fontFamily: theme.font === 'font-serif' ? '"Cormorant Garamond", serif' : '"Unbounded", sans-serif', letterSpacing: '-0.03em' }}>{slide.title}</h1>
              <p {...el('body-lead')} className={`text-2xl font-medium opacity-90 ${theme.accent}`}>{slide.points[0] || 'Business Overview'}</p>
            </div>
        </div>
      ) : slide.type === 'data' ? (
        <div {...el('container-section')} className="flex-1 flex flex-col relative z-10">
            <h2 {...el('heading-section')} className="text-5xl font-black mb-12 text-white border-b border-white/10 pb-6" style={{ fontFamily: '"Unbounded", sans-serif', letterSpacing: '-0.02em' }}>{slide.title}</h2>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                {slide.points.map((p, i) => {
                  const [val, label] = p.includes(':') ? p.split(':') : [p, ''];
                  return (
                    <div key={i} className={`p-6 rounded-2xl bg-white/5 border ${theme.border} backdrop-blur-sm`}>
                      <p className={`text-4xl font-black mb-1 ${theme.accent}`}>{val}</p>
                      <p className="text-gray-300 text-lg font-medium">{label}</p>
                    </div>
                  );
                })}
              </div>
              <div className={`h-full min-h-[300px] rounded-3xl bg-white/5 border ${theme.border} flex items-center justify-center relative overflow-hidden p-4`}>
                 {slide.imageData ? (
                   <img src={slide.imageData} className="w-full h-full object-contain rounded-xl" alt="Data Visualization" />
                 ) : (
                   <div className="text-center opacity-30">
                     <PieChart size={64} className={`mx-auto mb-4 ${theme.accent}`} />
                     <p>Generating Chart...</p>
                   </div>
                 )}
              </div>
            </div>
        </div>
      ) : slide.type === 'quote' ? (
        <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-12">
            <div className="text-8xl opacity-20 font-serif absolute top-10 left-10">"</div>
            <blockquote className="text-4xl md:text-5xl font-medium text-center leading-relaxed text-white italic max-w-4xl" style={{ fontFamily: theme.font === 'font-serif' ? '"Cormorant Garamond", serif' : '"Unbounded", sans-serif', letterSpacing: '-0.01em' }}>
              {slide.title}
            </blockquote>
             <div className="text-8xl opacity-20 font-serif absolute bottom-10 right-10">"</div>
             <div className={`mt-12 w-24 h-1 ${theme.accent.replace('text-', 'bg-')}`}></div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col relative z-10">
            <div className={`w-20 h-2 rounded-full mb-8 ${theme.accent.replace('text-', 'bg-')}`}></div>
            <h2 className="text-5xl font-black mb-12 text-white" style={{ fontFamily: '"Unbounded", sans-serif', letterSpacing: '-0.02em' }}>{slide.title}</h2>
            <div className="flex flex-col md:flex-row gap-12">
               <div className="flex-1 space-y-8">
                {slide.points.map((p, i) => (
                  <div key={i} className="flex items-start gap-6">
                    <div className={`mt-2 w-4 h-4 rounded-full ${theme.accent.replace('text-', 'bg-')} shadow-[0_0_10px_currentColor]`}></div>
                    <p className="text-2xl text-gray-200 leading-relaxed">{p.replace(/^- /, '')}</p>
                  </div>
                ))}
               </div>
               {slide.imageData && (
                 <div className="w-1/3 hidden md:block">
                    <img src={slide.imageData} className="w-full h-auto rounded-2xl border border-white/10 shadow-2xl" alt="Illustration" />
                 </div>
               )}
            </div>
        </div>
      )}

      {/* Footer */}
      <div className="absolute bottom-6 left-8 right-8 flex justify-between items-center opacity-40 mix-blend-plus-lighter">
          <div className="flex items-center gap-3 min-w-0">
            <p className="text-sm font-black uppercase tracking-widest text-white">StacFund Generated</p>
            {/* Attribution for stock photos (Pexels/Pixabay license requirement).
                Hidden for AI-generated images (no attribution needed). */}
            {slide.imageAttribution && (
              <span className="text-[10px] text-white/80 font-normal normal-case tracking-normal truncate max-w-[40%]">
                Photo: {slide.imageAttribution.photographer} / {slide.imageAttribution.source}
              </span>
            )}
            {/* Source badge — small label showing where the image came from.
                Helps the user understand which mode produced the current slide. */}
            {slide.imageSource && slide.imageSource !== 'ai' && !slide.imageAttribution && (
              <span className="text-[10px] text-white/80 font-normal normal-case tracking-normal">
                [{slide.imageSource}]
              </span>
            )}
          </div>
          <p className="text-sm font-black uppercase tracking-widest text-white">{index + 1} / {total}</p>
      </div>
  </div>
);

const PresentationDesigner: React.FC<PresentationDesignerProps> = ({ user, onClose }) => {
  const [step, setStep] = useState<'select' | 'outline-loading' | 'outline' | 'generating' | 'editor'>('select');
  const [documents, setDocuments] = useState<AppDocument[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [theme, setTheme] = useState(THEMES[0]); // gamma-purple is now the default
  const [presentonTemplate, setPresentonTemplate] = useState('stacfund-template');
  const [loadingMessage, setLoadingMessage] = useState('');
  const [syncingBrand, setSyncingBrand] = useState(false);
  // ─── Outline-first state ────────────────────────────────────────────
  // The draft outline (from AI or strategy-seeded) shown in OutlineEditor.
  // The user reviews/edits here before full slide generation begins.
  const [outlineSlides, setOutlineSlides] = useState<OutlineSlide[]>([]);
  const [outlineStrategyId, setOutlineStrategyId] = useState<string | undefined>(undefined);
  const [outlineSourceDoc, setOutlineSourceDoc] = useState<AppDocument | null>(null);
  const [outlineLoadingMessage, setOutlineLoadingMessage] = useState('');
  // ─── Image source mode ──────────────────────────────────────────────
  // Controls whether slides use AI-generated images (Imagen), stock photos
  // (Pexels/Pixabay), or auto-fallback (AI first → stock on failure).
  // Default: 'auto' — best of both worlds. User can switch in editor sidebar.
  const [imageSourceMode, setImageSourceMode] = useState<ImageSourceMode>('auto');
  // ─── Video export state ──────────────────────────────────────────────
  // Tracks the progress of video recording (slide N of M). Null when not recording.
  // Hidden render container ref — used by video exporter to paint slides to canvas.
  const [videoProgress, setVideoProgress] = useState<{ current: number; total: number } | null>(null);
  const videoRenderRef = useRef<HTMLDivElement>(null);
  const videoAbortRef = useRef<AbortController | null>(null);

  const handleBrandSync = async () => {
    const url = prompt("Enter your website URL (e.g., https://example.com) to extract brand colors:");
    if (!url) return;
    
    setSyncingBrand(true);
    try {
      const res = await fetch('/api/brand-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (res.ok) {
        const data = await res.json();
        // Create a custom theme based on the extracted colors
        const primary = data.primaryColor || '#a855f7';
        const secondary = data.secondaryColor || '#6d28d9';
        const customTheme = {
          id: 'custom-brand',
          name: 'Custom Brand',
          bg: `bg-[#0a0a1a]`,
          accent: `text-[${primary}]`,
          border: `border-[${primary}]/30`,
          font: data.font || 'font-sans',
          graphColor: primary,
          gradient: `linear-gradient(135deg, #0a0a1a 0%, ${secondary} 50%, ${primary} 100%)`,
          swatch: ['#0a0a1a', secondary, primary]
        };
        // Add to themes and set as active
        if (!THEMES.find(t => t.id === 'custom-brand')) {
          THEMES.push(customTheme);
        } else {
          const index = THEMES.findIndex(t => t.id === 'custom-brand');
          THEMES[index] = customTheme;
        }
        setTheme(customTheme);
        alert(`Successfully synced brand colors from ${url}`);
      } else {
        alert('Failed to extract brand colors.');
      }
    } catch (e) {
      alert('Error connecting to brand sync service.');
    } finally {
      setSyncingBrand(false);
    }
  };

  useEffect(() => {
    const fetchDocs = async () => {
      if (!user) return;
      try {
        const docsRef = collection(db, 'users', user.id, 'documents');
        const docSnapshot = await getDocs(docsRef);
        const fetchedDocs = docSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppDocument));
        setDocuments(fetchedDocs.filter(d => d.type === 'text/plain' || d.content));
      } catch (error) {
        console.error('Error fetching documents:', error);
      }
    };
    fetchDocs();
  }, [user]);

  // ─── Outline-first flow ─────────────────────────────────────────────
  // Phase 1: generateOutline() produces a draft OutlineSlide[] (fast — no images).
  // Phase 2: OutlineEditor lets user review/edit/reorder/add/remove slides.
  // Phase 3: generateFullPresentation() takes the user-approved outline and
  //          generates the full slide deck (titles, points, visualPrompts) —
  //          using the outline as strong structural guidance.
  //
  // This is the Gamma UX pattern: outline → review → generate.

  // Entry point — called when user clicks a document in the select step.
  // Generates the draft outline (with default strategy = SA Funding Pitch).
  const startOutlineGeneration = async (doc: AppDocument, strategyId?: string) => {
    setStep('outline-loading');
    setOutlineLoadingMessage(strategyId ? 'Adapting outline to your document...' : 'Drafting outline...');
    setOutlineSourceDoc(doc);

    try {
      const strategy = strategyId ? getStrategyById(strategyId) : getDefaultStrategy();
      if (!strategy) throw new Error('Strategy not found');
      const result = await generateOutline({
        documentName: doc.name,
        businessName: user?.businessName,
        documentContent: doc.content,
        strategy,
      });
      setOutlineSlides(result.slides);
      setOutlineStrategyId(result.strategyId);
      setStep('outline');
    } catch (error) {
      handleGeminiError(error);
      alert('Failed to generate outline. Please try again.');
      setStep('select');
    }
  };

  // Called when user switches strategy in OutlineEditor — re-seed the outline.
  const handleStrategyChange = async (strategyId: string) => {
    if (!outlineSourceDoc) return;
    // Re-run outline generation with the new strategy
    await startOutlineGeneration(outlineSourceDoc, strategyId);
  };

  // Called when user clicks "Generate Full Deck" in OutlineEditor.
  // Converts the user-edited OutlineSlide[] into the Slide[] shape the editor
  // expects, then triggers background image generation.
  const generateFullPresentation = async (editedOutline: OutlineSlide[]) => {
    setStep('generating');
    setLoadingMessage('Building full slide deck from your outline...');

    try {
      const ai = await createGeminiClient();

      // Build a prompt that uses the outline as strong structural guidance.
      // The AI's job is to expand each outline slide into full slide content
      // (title, polished points, refined visualPrompt) — not to invent structure.
      const outlineJson = editedOutline.map(s => ({
        role: s.role,
        title: s.title,
        bullets: s.points || [], // Map points/bullets properly
        layout: s.layout,
        copyFormula: s.copyFormula,
        emotion: s.emotion,
        guidance: s.role,
        visualPrompt: s.visualPrompt,
      }));

      const prompt = `You are expanding a user-approved pitch deck outline into full slide content.

Business: ${user?.businessName || 'A South African business'}
Source document: "${outlineSourceDoc?.name || 'Business profile'}"

USER-APPROVED OUTLINE (do not change slide order, role, layout, formula, or emotion — only expand the text):
${JSON.stringify(outlineJson, null, 2)}

TASK: For each outline slide, produce a final slide object with:
- type: 'cover' (for the first slide only) | 'content' (most slides) | 'data' (when layout is 'metrics-dashboard' or 'big-number-hero' or 'comparison-table') | 'quote' (when layout is 'quote-testimonial')
- title: a polished version of the outline title (max 10 words)
- points: 3-5 punchy bullet points (each max 15 words) that fulfill the slide's guidance + copyFormula + emotion goal
- visualPrompt: a refined image/chart description (max 20 words) suitable for AI image generation

South African context. All financial figures in ZAR.
Output MUST be valid JSON matching the responseSchema. Array length must equal input length (${editedOutline.length}).`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.7,
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['cover', 'content', 'data', 'quote'] },
                title: { type: Type.STRING },
                points: { type: Type.ARRAY, items: { type: Type.STRING } },
                visualPrompt: { type: Type.STRING }
              },
              required: ['type', 'title', 'points', 'visualPrompt'],
            },
          },
        },
      });

      let generatedSlides: any[] = [];
      try {
        generatedSlides = JSON.parse(response.text || '[]');
      } catch (e) {
        // Recovery: strip markdown fences and try again
        const cleaned = (response.text || '').trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
        generatedSlides = JSON.parse(cleaned);
      }

      if (!Array.isArray(generatedSlides) || generatedSlides.length === 0) {
        throw new Error('Gemini returned an empty slide array');
      }

      const slidesWithIds: Slide[] = generatedSlides.map((s: any, i: number) => ({
        id: i.toString(),
        type: s.type || 'content',
        title: String(s.title || 'Untitled Slide'),
        points: Array.isArray(s.points) ? s.points.map(String) : [],
        visualPrompt: s.visualPrompt ? String(s.visualPrompt) : undefined,
        isGeneratingImage: false,
      }));
      setSlides(slidesWithIds);
      setStep('editor');

      // Trigger background image generation for cover/data/content slides
      slidesWithIds.forEach((slide: Slide, index: number) => {
        if (['cover', 'data', 'content'].includes(slide.type)) {
          generateSlideImage(slide, index);
        }
      });
    } catch (error) {
      handleGeminiError(error);
      alert('Failed to generate full deck. Please try again.');
      setStep('outline');
    }
  };

  // ─── Slide image generation (orchestrator-backed) ──────────────────────
  // Replaces the direct Imagen-only call with the orchestrator that supports
  // 3 modes: 'ai' (Imagen), 'stock' (Pexels/Pixabay), 'auto' (AI → stock fallback).
  // The mode is controlled by `imageSourceMode` state, switchable in the editor sidebar.
  //
  // On success, sets `imageData` + `imageAttribution` + `imageSource` on the slide.
  // On failure (all sources exhausted in auto mode), clears `isGeneratingImage`
  // and leaves the slide without an image — same behavior as before, but now
  // with a console error explaining what failed.
  const generateSlideImage = async (slide: Slide, index: number) => {
    setSlides(prev => prev.map((s, i) => i === index ? { ...s, isGeneratingImage: true } : s));

    try {
      const result = await orchestratorGenerateImage({
        prompt: slide.visualPrompt || slide.title,
        searchQuery: deriveStockSearchQuery(slide.visualPrompt || '', slide.title),
        slideType: slide.type,
        swatchColors: theme.swatch,
        themeName: theme.name,
        slideIndex: index,
        mode: imageSourceMode,
      });

      setSlides(prev => prev.map((s, i) => i === index ? {
        ...s,
        imageData: result.imageData,
        imageAttribution: result.attribution,
        imageSource: result.source,
        isGeneratingImage: false,
      } : s));
    } catch (e) {
      // For 'auto' mode, the orchestrator already tried both sources internally.
      // For 'ai' or 'stock' modes, this is the first failure — show the Gemini
      // error handler (which surfaces content-policy / quota messages to the user).
      if (imageSourceMode !== 'auto') {
        handleGeminiError(e);
      } else {
        console.error('[generateSlideImage] All image sources failed:', e);
      }
      setSlides(prev => prev.map((s, i) => i === index ? { ...s, isGeneratingImage: false } : s));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // ─── Video export ────────────────────────────────────────────────────
  // Records the slide deck as a video by:
  //   1. Creating a hidden render container at slide dimensions
  //   2. For each slide: render it via SlideRenderer into the hidden container,
  //      use html2canvas to paint it onto the recording canvas
  //   3. MediaRecorder captures the canvas stream while slides advance
  //   4. Output: .webm (Chrome/Firefox) or .mp4 (Safari) — auto-detected
  const handleVideoExport = async () => {
    if (!videoRenderRef.current) return;
    if (slides.length === 0) {
      alert('No slides to export.');
      return;
    }
    if (!isVideoExportSupported()) {
      alert('Video export is not supported in this browser. Try Chrome, Firefox, or Safari 14+.');
      return;
    }

    videoAbortRef.current = new AbortController();

    // Ask the user for seconds per slide (default 3)
    const input = prompt('Seconds per slide?', '3');
    if (!input) return;
    const secondsPerSlide = Math.max(1, Math.min(10, parseInt(input, 10) || 3));

    setVideoProgress({ current: 0, total: slides.length });

    // Set up the hidden render container at slide dimensions (16:9)
    const renderEl = videoRenderRef.current;
    renderEl.style.width = '1280px';
    renderEl.style.height = '720px';
    renderEl.style.display = 'block';

    // We use a stable React root to render each slide into the hidden container
    const { createRoot } = await import('react-dom/client');
    const root = createRoot(renderEl);

    try {
      const result = await exportSlidesToVideo(
        slides,
        async (slide, canvas, width, height, index) => {
          // Render the slide into the hidden container via React
          await new Promise<void>((resolve) => {
            root.render(
              <div style={{ width: '1280px', height: '720px' }}>
                <SlideRenderer slide={slide} theme={theme} index={index} total={slides.length} />
              </div>
            );
            // Wait for React to flush + images to potentially load
            setTimeout(resolve, 200);
          });

          // Paint the rendered slide onto the recording canvas via html2canvas
          const slideEl = renderEl.firstElementChild as HTMLElement;
          if (slideEl) {
            await paintElementToCanvas(slideEl, canvas, width, height);
          }
        },
        {
          secondsPerSlide,
          fps: 30,
          width: 1280,
          height: 720,
          onProgress: (current, total, title) => {
            setVideoProgress({ current, total });
          },
          signal: videoAbortRef.current.signal,
        }
      );

      const filename = `${user?.businessName || 'Business'} Pitch Deck Video`;
      downloadVideoBlob(result.blob, filename, result.extension);
      setVideoProgress(null);
    } catch (error) {
      console.error('Video export failed:', error);
      if ((error as Error).message !== 'Export cancelled by user') {
        alert('Video export failed: ' + (error as Error).message);
      }
      setVideoProgress(null);
    } finally {
      // Clean up
      root.unmount();
      renderEl.style.display = 'none';
      renderEl.innerHTML = '';
      videoAbortRef.current = null;
    }
  };

  const handleCancelVideoExport = () => {
    videoAbortRef.current?.abort();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      {/* Print Styles */}
      <style>{`
        @media print {
          @page { margin: 0; size: landscape; }
          body * { visibility: hidden; }
          .print-container, .print-container * { visibility: visible; }
          .print-container { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100vw; 
            background: white;
          }
          .print-slide { 
            width: 100vw; 
            height: 100vh; 
            page-break-after: always; 
            break-after: page; 
            display: flex;
            overflow: hidden;
            position: relative;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          /* Ensure backgrounds print correctly */
          .bg-\\[\\#0a0a1a\\] { background-color: #0a0a1a !important; }
          .bg-\\[\\#051a05\\] { background-color: #051a05 !important; }
          .bg-\\[\\#1a051a\\] { background-color: #1a051a !important; }
        }
      `}</style>

      {/* Hidden Container for Printing */}
      {step === 'editor' && (
        <div className="print-container fixed inset-0 pointer-events-none opacity-0 z-[-1]">
          {slides.map((slide, idx) => (
            <div key={idx} className="print-slide">
              <SlideRenderer slide={slide} theme={theme} index={idx} total={slides.length} />
            </div>
          ))}
        </div>
      )}

      {/* UI Container */}
      <div className="relative w-full max-w-7xl h-[90vh] bg-[#050510] rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden flex no-print">
        
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 z-50 p-2 rounded-full bg-black/50 hover:bg-white/20 text-white transition-all"
        >
          <X size={24} />
        </button>

        {step === 'select' && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <div className="w-24 h-24 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-3xl flex items-center justify-center mb-8 shadow-2xl shadow-cyan-500/20">
              <Layout size={48} className="text-white" />
            </div>
            <h2 className="text-4xl font-black mb-4">Presentation Designer</h2>
            <p className="text-gray-400 max-w-lg mb-12 text-lg">
              Pick a document to start. We'll draft an outline you can edit, then generate the full deck — Gamma-style.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
              {documents.length > 0 ? (
                documents.map(doc => (
                  <button 
                    key={doc.id}
                    onClick={() => startOutlineGeneration(doc)}
                    className="p-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/50 transition-all group text-left flex items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-cyan-400 group-hover:scale-110 transition-all">
                      <ListChecks size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white group-hover:text-cyan-400 transition-colors truncate w-48">{doc.name}</h4>
                      <p className="text-xs text-gray-500">Outline-first • AI Generated</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="col-span-2 p-8 rounded-2xl border border-dashed border-white/20 text-gray-500">
                  No generated text documents found. Go to Profile &gt; Documents and generate a Business Plan first.
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'generating' && (
          <div className="flex-1 flex flex-col items-center justify-center p-10">
            <Loader2 size={64} className="text-cyan-400 animate-spin mb-8" />
            <h3 className="text-2xl font-black animate-pulse">{loadingMessage}</h3>
            <p className="text-gray-500 mt-2">Building slides from your outline and generating visuals...</p>
          </div>
        )}

        {step === 'outline-loading' && (
          <div className="flex-1 flex flex-col items-center justify-center p-10">
            <Loader2 size={64} className="text-cyan-400 animate-spin mb-8" />
            <h3 className="text-2xl font-black animate-pulse">{outlineLoadingMessage}</h3>
            <p className="text-gray-500 mt-2">Drafting your pitch deck outline...</p>
          </div>
        )}

        {step === 'editor' && (
          <div className="flex-1 flex flex-col md:flex-row h-full">
            {/* Sidebar Controls */}
            <div className="w-full md:w-80 bg-[#0a0a1a] border-r border-white/10 p-6 flex flex-col h-full overflow-y-auto custom-scrollbar z-20">
              <div className="mb-8">
                <h3 className="text-lg font-black mb-4 flex items-center gap-2">
                  <Palette size={18} className="text-cyan-400" /> Theme
                </h3>
                {/* Theme picker — redesigned to show gradient swatches + names.
                    Each button shows a mini gradient preview using the theme's
                    `swatch` colors, so the user can see exactly what the slide
                    background will look like before selecting. */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {THEMES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t)}
                      className={`relative flex flex-col items-start gap-1.5 p-2 rounded-xl border-2 transition-all overflow-hidden ${t.id === theme.id ? 'border-white scale-[1.02] shadow-lg' : 'border-white/10 opacity-60 hover:opacity-100'}`}
                    >
                      {/* Gradient preview bar */}
                      <div
                        className="w-full h-8 rounded-lg flex items-center justify-center"
                        style={{
                          background: t.gradient || t.swatch[0],
                          boxShadow: t.id === theme.id ? `0 0 12px ${t.graphColor}80` : 'none'
                        }}
                      >
                        <div className="w-4 h-4 rounded-full" style={{ background: t.swatch[2], boxShadow: `0 0 6px ${t.swatch[2]}` }} />
                      </div>
                      <span className="text-[10px] font-bold text-white/80 truncate w-full text-left">{t.name}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleBrandSync}
                  disabled={syncingBrand}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm text-cyan-400 border border-cyan-500/30 transition-colors"
                >
                  {syncingBrand ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {syncingBrand ? 'Syncing...' : 'Brand Sync (URL)'}
                </button>
              </div>

              {/* ─── Image source mode picker ─────────────────────────────────
                  Controls whether slides use AI-generated images (Imagen),
                  stock photos (Pexels/Pixabay), or auto-fallback.
                  Affects NEW image generation — existing slides keep their images.
                  To re-generate with a different mode, click the refresh icon
                  on the slide in the slides list (TODO — not yet implemented). */}
              <div className="mt-6 pt-6 border-t border-white/10">
                <h3 className="text-sm font-black mb-3 flex items-center gap-2">
                  <ImageIcon size={16} className="text-cyan-400" /> Image Source
                </h3>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {(['auto', 'ai', 'stock'] as ImageSourceMode[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setImageSourceMode(m)}
                      title={getImageSourceModeDescription(m)}
                      className={`px-2 py-2 rounded-lg text-xs font-bold transition-all ${
                        imageSourceMode === m
                          ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-400'
                          : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {m === 'auto' ? 'Auto' : m === 'ai' ? 'AI' : 'Stock'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-500 leading-tight">
                  {getImageSourceModeDescription(imageSourceMode)}
                </p>
                <p className="text-[10px] text-gray-600 mt-1.5 leading-tight">
                  Applies to new image generation. Existing slides keep their images.
                </p>
              </div>

              <div className="flex-1">
                <h3 className="text-lg font-black mb-4 flex items-center gap-2">
                  <Layout size={18} className="text-cyan-400" /> Slides
                </h3>
                <div className="space-y-3">
                  {slides.map((slide, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentSlideIndex(idx)}
                      className={`w-full p-3 rounded-xl text-left border transition-all relative overflow-hidden ${
                        currentSlideIndex === idx 
                          ? 'bg-white/10 border-cyan-500/50 text-white' 
                          : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                      }`}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-70">Slide {idx + 1} • {slide.type}</p>
                      <p className="text-sm font-medium truncate">{slide.title}</p>
                      {slide.isGeneratingImage && (
                        <div className="absolute top-2 right-2">
                          <Loader2 size={12} className="animate-spin text-cyan-400" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-white/10">
                <div className="mb-4">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Professional PPTX Theme</label>
                  <select 
                    value={presentonTemplate}
                    onChange={(e) => setPresentonTemplate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white font-medium focus:border-purple-500 transition-colors"
                  >
                    <option value="stacfund-template">StacFund Investor (Default)</option>
                    <option value="mint-blue">Mint Blue</option>
                    <option value="edge-yellow">Edge Yellow</option>
                    <option value="light-rose">Light Rose</option>
                    <option value="professional-blue">Professional Blue</option>
                  </select>
                </div>
                <button
                  onClick={async () => {
                    try {
                      // ─── CLIENT-SIDE PPTX EXPORT (pptxgenjs) ───────────────
                      // Replaces the dead /api/presenton/generate stub that required
                      // a Python backend. Now generates editable PPTX directly in
                      // the browser with native text boxes, shapes, and images.
                      const { exportSlidesToPptx } = await import('../utils/exportPptx');
                      await exportSlidesToPptx(
                        slides,
                        theme as any,
                        `${user?.businessName || 'Business'} Pitch Deck`,
                        user?.businessName
                      );
                    } catch (error) {
                      console.error('PPTX export failed:', error);
                      alert('Failed to export PPTX: ' + (error as Error).message);
                    }
                  }}
                  className="w-full mb-3 py-4 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-600/20"
                >
                  <Sparkles size={18} /> Export Editable PPTX
                </button>
                <button 
                  onClick={handlePrint}
                  className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-500/20"
                >
                  <Download size={18} /> Export PDF
                </button>
                {/* ─── Video export (MediaRecorder → WebM/MP4) ─────────────────
                    Hidden on browsers that don't support MediaRecorder +
                    canvas.captureStream (older Safari). Uses isVideoExportSupported()
                    to gate the button. */}
                {isVideoExportSupported() && (
                  <button
                    onClick={videoProgress ? handleCancelVideoExport : handleVideoExport}
                    className={`w-full mt-3 py-4 font-black rounded-xl flex items-center justify-center gap-2 transition-all ${
                      videoProgress
                        ? 'bg-red-600/30 hover:bg-red-600/50 text-red-300 border border-red-500/50'
                        : 'bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-lg shadow-pink-600/20'
                    }`}
                  >
                    {videoProgress ? (
                      <>
                        <X size={18} /> Cancel ({videoProgress.current}/{videoProgress.total})
                      </>
                    ) : (
                      <>
                        <Video size={18} /> Export Video
                      </>
                    )}
                  </button>
                )}
                {videoProgress && (
                  <div className="mt-2 px-2">
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-pink-500 to-rose-500 transition-all duration-300"
                        style={{ width: `${(videoProgress.current / videoProgress.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5 text-center">
                      Recording slide {videoProgress.current} of {videoProgress.total}...
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-gray-500 text-center mt-3">
                  PDF: includes all AI-generated graphics. Video: WebM (Chrome/Firefox) or MP4 (Safari), 3s per slide.
                </p>
              </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 bg-[#1a1a2e] relative flex items-center justify-center p-8 overflow-hidden">
               {/* Previous/Next Overlays */}
               <button 
                 onClick={() => setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1))}
                 disabled={currentSlideIndex === 0}
                 className="absolute left-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/50 hover:bg-white/20 text-white disabled:opacity-0 transition-all z-30"
               >
                 <ChevronLeft size={24} />
               </button>
               <button 
                 onClick={() => setCurrentSlideIndex(Math.min(slides.length - 1, currentSlideIndex + 1))}
                 disabled={currentSlideIndex === slides.length - 1}
                 className="absolute right-4 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/50 hover:bg-white/20 text-white disabled:opacity-0 transition-all z-30"
               >
                 <ChevronRight size={24} />
               </button>

               {/* The Active Slide */}
               <div className="aspect-video w-full max-w-5xl shadow-2xl transition-all duration-500 transform">
                 {slides[currentSlideIndex] ? (
                   <SlideRenderer slide={slides[currentSlideIndex]} theme={theme} index={currentSlideIndex} total={slides.length} />
                 ) : (
                   <div className="flex flex-col items-center justify-center h-full text-gray-500">
                     <Loader2 size={32} className="animate-spin text-cyan-400" />
                   </div>
                 )}
               </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Hidden video render container ───────────────────────────────────
          Used by handleVideoExport to render each slide via SlideRenderer at
          1280×720, then html2canvas paints it onto the recording canvas.
          Off-screen (position:absolute, left:-99999px) so it doesn't affect layout. */}
      <div
        ref={videoRenderRef}
        style={{
          position: 'absolute',
          left: '-99999px',
          top: 0,
          width: '1280px',
          height: '720px',
          display: 'none',
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      />

      {/* ─── Outline Editor (full-screen overlay) ────────────────────────────
          Renders above the modal when step === 'outline'. Lets the user
          review/edit/reorder the draft outline before full generation. */}
      {step === 'outline' && outlineSourceDoc && (
        <OutlineEditor
          initialOutline={outlineSlides}
          currentStrategyId={outlineStrategyId || ''}
          docName={outlineSourceDoc.name}
          businessName={user?.businessName || ''}
          docContent={outlineSourceDoc.content || ''}
          onGenerate={(editedSlides) => generateFullPresentation(editedSlides)}
          onBack={() => setStep('select')}
          onStrategyChange={handleStrategyChange}
        />
      )}
    </div>
  );
};

export default PresentationDesigner;
export { SlideRenderer };
