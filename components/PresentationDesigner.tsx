import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Sparkles, Layout, Image as ImageIcon, Download, ChevronLeft, ChevronRight, 
  Palette, Wand2, Loader2, PieChart, Film, Play, Settings, RefreshCw, AlertCircle
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User, AppDocument } from '../types';
import { el, ELEMENT_TAXONOMY } from '../utils/elementTypes';
import { SlideOutline, PITCH_STRATEGIES } from '../utils/outlineStrategies';
import { generateSlideOutline } from '../utils/outlineGenerator';
import { OutlineEditor } from './OutlineEditor';
import { generateOrGetImage, ImageSourceMode } from '../utils/imageOrchestrator';
import { exportDeckToVideo } from '../utils/videoExporter';

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
}

const THEMES = [
  { id: 'modern', name: 'Modern Blue', bg: 'bg-[#0a0a1a]', accent: 'text-cyan-400', border: 'border-cyan-500/30', font: 'font-sans', graphColor: '#22d3ee' },
  { id: 'eco', name: 'Eco Green', bg: 'bg-[#051a05]', accent: 'text-emerald-400', border: 'border-emerald-500/30', font: 'font-serif', graphColor: '#34d399' },
  { id: 'bold', name: 'Bold Purple', bg: 'bg-[#1a051a]', accent: 'text-purple-400', border: 'border-purple-500/30', font: 'font-sans', graphColor: '#a855f7' },
];

// Helper to render slide content (used for Editor, Print view, and Video capture)
const SlideRenderer = ({ slide, theme, index, total }: { slide: Slide, theme: typeof THEMES[0], index: number, total: number }) => (
  <div 
    className={`w-full h-full ${theme.bg} relative overflow-hidden flex flex-col p-8 md:p-16 border-4 ${theme.border}`}
    {...el(ELEMENT_TAXONOMY.CONTAINER_SLIDE)}
  >
      {/* Background Pattern */}
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none" 
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}
        {...el(ELEMENT_TAXONOMY.VECTOR_DECORATIVE)}
      />
      
      {/* Slide Content */}
      {slide.type === 'cover' ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center relative z-10" {...el(ELEMENT_TAXONOMY.CONTAINER_COVER)}>
            {slide.imageData ? (
              <div className="absolute inset-0 opacity-50 mix-blend-screen" {...el(ELEMENT_TAXONOMY.IMAGE_BACKGROUND)}>
                <img src={slide.imageData} alt="Generated Visual" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <div className={`absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent`}></div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center opacity-5" {...el(ELEMENT_TAXONOMY.VECTOR_DECORATIVE)}>
                <ImageIcon size={300} />
              </div>
            )}
            <div className="relative z-20 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-8" {...el(ELEMENT_TAXONOMY.BADGE)}>
                <Sparkles size={16} className={theme.accent} />
                <span className="text-sm font-bold uppercase tracking-widest text-white">Business Proposal</span>
              </div>
              <h1 className={`text-5xl md:text-6xl font-black mb-8 leading-tight ${theme.font} text-white drop-shadow-2xl`} {...el(ELEMENT_TAXONOMY.TITLE_COVER)}>{slide.title}</h1>
              <p className={`text-xl font-medium opacity-90 ${theme.accent}`} {...el(ELEMENT_TAXONOMY.SUBTITLE_COVER)}>{slide.points[0] || 'Business Overview'}</p>
            </div>
        </div>
      ) : slide.type === 'data' ? (
        <div className="flex-1 flex flex-col relative z-10" {...el(ELEMENT_TAXONOMY.CONTAINER_GRID)}>
            <h2 className={`text-4xl font-black mb-10 ${theme.font} text-white border-b border-white/10 pb-4`} {...el(ELEMENT_TAXONOMY.HEADING_PRIMARY)}>{slide.title}</h2>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="space-y-4" {...el(ELEMENT_TAXONOMY.CONTAINER_COLUMN, 'metrics')}>
                {slide.points.map((p, i) => {
                  const [val, label] = p.includes(':') ? p.split(':') : [p, ''];
                  return (
                    <div key={i} className={`p-5 rounded-2xl bg-white/5 border ${theme.border} backdrop-blur-sm`} {...el(ELEMENT_TAXONOMY.FINANCIAL_METRIC)}>
                      <p className={`text-3xl font-black mb-1 ${theme.accent}`} {...el(ELEMENT_TAXONOMY.ASK_AMOUNT)}>{val}</p>
                      <p className="text-gray-300 text-sm font-medium" {...el(ELEMENT_TAXONOMY.TEXT_BODY)}>{label}</p>
                    </div>
                  );
                })}
              </div>
              <div 
                className={`h-full min-h-[250px] rounded-3xl bg-white/5 border ${theme.border} flex items-center justify-center relative overflow-hidden p-4`}
                {...el(ELEMENT_TAXONOMY.CHART_CONTAINER)}
              >
                 {slide.imageData ? (
                   <img src={slide.imageData} className="w-full h-full object-contain rounded-xl" alt="Data Visualization" referrerPolicy="no-referrer" {...el(ELEMENT_TAXONOMY.CHART_ELEMENT)} />
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
        <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-12" {...el(ELEMENT_TAXONOMY.QUOTE_CONTAINER)}>
            <div className="text-8xl opacity-20 font-serif absolute top-10 left-10 text-white">"</div>
            <blockquote className={`text-3xl md:text-4xl font-medium text-center leading-relaxed ${theme.font} text-white italic max-w-4xl`} {...el(ELEMENT_TAXONOMY.QUOTE_TEXT)}>
              {slide.title}
            </blockquote>
             <div className="text-8xl opacity-20 font-serif absolute bottom-10 right-10 text-white">"</div>
             <div className={`mt-12 w-24 h-1 ${theme.accent.replace('text-', 'bg-')}`} {...el(ELEMENT_TAXONOMY.VECTOR_DECORATIVE)}></div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col relative z-10" {...el(ELEMENT_TAXONOMY.CONTAINER_GRID)}>
            <div className={`w-20 h-2 rounded-full mb-6 ${theme.accent.replace('text-', 'bg-')}`} {...el(ELEMENT_TAXONOMY.VECTOR_DECORATIVE)}></div>
            <h2 className={`text-4xl font-black mb-10 ${theme.font} text-white`} {...el(ELEMENT_TAXONOMY.HEADING_PRIMARY)}>{slide.title}</h2>
            <div className="flex flex-col md:flex-row gap-8">
               <div className="flex-1 space-y-6" {...el(ELEMENT_TAXONOMY.LIST_BULLET)}>
                {slide.points.map((p, i) => (
                  <div key={i} className="flex items-start gap-4" {...el(ELEMENT_TAXONOMY.TEXT_BULLET_ITEM)}>
                    <div className={`mt-2 w-3 h-3 rounded-full ${theme.accent.replace('text-', 'bg-')} shadow-[0_0_10px_currentColor]`} {...el(ELEMENT_TAXONOMY.VECTOR_DECORATIVE)}></div>
                    <p className="text-lg text-gray-200 leading-relaxed" {...el(ELEMENT_TAXONOMY.TEXT_BODY)}>{p.replace(/^- /, '')}</p>
                  </div>
                ))}
               </div>
               {slide.imageData && (
                 <div className="w-1/3 hidden md:block" {...el(ELEMENT_TAXONOMY.CONTAINER_COLUMN, 'sidebar-image')}>
                    <img src={slide.imageData} className="w-full h-auto rounded-2xl border border-white/10 shadow-2xl" alt="Illustration" referrerPolicy="no-referrer" {...el(ELEMENT_TAXONOMY.IMAGE_SLIDE)} />
                 </div>
               )}
            </div>
        </div>
      )}

      {/* Footer */}
      <div className="absolute bottom-6 left-8 right-8 flex justify-between items-center opacity-40 mix-blend-plus-lighter" {...el(ELEMENT_TAXONOMY.FOOTER_SECTION)}>
          <p className="text-xs font-black uppercase tracking-widest text-white" {...el(ELEMENT_TAXONOMY.METADATA_LINE)}>StacFund Generated</p>
          <p className="text-xs font-black uppercase tracking-widest text-white" {...el(ELEMENT_TAXONOMY.SLIDE_NUMBER)}>{index + 1} / {total}</p>
      </div>
  </div>
);

export const PresentationDesigner: React.FC<PresentationDesignerProps> = ({ user, onClose }) => {
  // New workflow phases
  const [step, setStep] = useState<'select' | 'generating-outline' | 'outline-review' | 'generating-deck' | 'editor'>('select');
  const [documents, setDocuments] = useState<AppDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<AppDocument | null>(null);

  // Outline-first states
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('sa-funding');
  const [imageSourceMode, setImageSourceMode] = useState<ImageSourceMode>('auto');
  const [outline, setOutline] = useState<SlideOutline[]>([]);

  // Generation & playback states
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [theme, setTheme] = useState(THEMES[0]);
  const [presentonTemplate, setPresentonTemplate] = useState('stacfund-template');
  
  // Custom interactive messages
  const [loadingMessage, setLoadingMessage] = useState('');
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  const [syncingBrand, setSyncingBrand] = useState(false);

  // Video Export states
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [videoExportProgress, setVideoExportProgress] = useState(0);
  const [videoExportMessage, setVideoExportMessage] = useState('');
  
  const videoCancelRef = useRef(false);
  const printContainerRef = useRef<HTMLDivElement>(null);

  // Load user's documents
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

  // Phase 1: Ingest document and trigger draft outline generation
  const handleDocSelected = async (doc: AppDocument) => {
    setSelectedDoc(doc);
    setStep('generating-outline');
    setLoadingMessage(`Extracting business intelligence and structuring outline using "${PITCH_STRATEGIES.find(s => s.id === selectedStrategyId)?.name}" template...`);

    try {
      const activeStrategy = PITCH_STRATEGIES.find(s => s.id === selectedStrategyId) || PITCH_STRATEGIES[0];
      const generatedOutline = await generateSlideOutline(
        doc.name, 
        user?.businessName || 'Your Startup', 
        activeStrategy, 
        doc.content || ''
      );
      
      setOutline(generatedOutline);
      setStep('outline-review');
    } catch (error) {
      console.error('Error generating presentation outline:', error);
      alert('Failed to construct the initial draft outline. Please try again.');
      setStep('select');
    }
  };

  // Triggered when strategy is modified on the editor sidebar
  const handleStrategyChange = async (strategyId: string) => {
    if (!selectedDoc) return;
    setSelectedStrategyId(strategyId);
    setStep('generating-outline');
    setLoadingMessage(`Regenerating draft structure using "${PITCH_STRATEGIES.find(s => s.id === strategyId)?.name}" template...`);
    
    try {
      const activeStrategy = PITCH_STRATEGIES.find(s => s.id === strategyId) || PITCH_STRATEGIES[0];
      const generatedOutline = await generateSlideOutline(
        selectedDoc.name,
        user?.businessName || 'Your Startup',
        activeStrategy,
        selectedDoc.content || ''
      );
      setOutline(generatedOutline);
      setStep('outline-review');
    } catch (e) {
      console.error(e);
      alert('Failed to regenerate outline.');
      setStep('outline-review');
    }
  };

  // Phase 3: Take finalized, edited outline and generate full slide deck assets (Images/Stock fallbacks)
  const handleFinalOutlineConfirmed = async (finalOutline: SlideOutline[]) => {
    setStep('generating-deck');
    setGenerationProgress({ current: 0, total: finalOutline.length });

    const generatedSlides: Slide[] = [];

    for (let idx = 0; idx < finalOutline.length; idx++) {
      const slideDef = finalOutline[idx];
      setGenerationProgress({ current: idx + 1, total: finalOutline.length });
      setLoadingMessage(`Generating assets for Slide ${idx + 1} of ${finalOutline.length}: "${slideDef.title}"...`);

      let imageUrl: string | undefined = undefined;

      // Call the image fallback orchestrator (AI -> Stock photo mode)
      if (['cover', 'data', 'content'].includes(slideDef.type)) {
        try {
          const imgResult = await generateOrGetImage(
            slideDef.title,
            slideDef.visualPrompt,
            slideDef.type,
            theme.name,
            theme.accent,
            imageSourceMode
          );
          if (imgResult) {
            imageUrl = imgResult.url;
          }
        } catch (e) {
          console.warn(`Asset generation failed for Slide ${idx + 1}, proceeding without image.`, e);
        }
      }

      generatedSlides.push({
        id: slideDef.id,
        type: slideDef.type,
        title: slideDef.title,
        points: slideDef.points,
        visualPrompt: slideDef.visualPrompt,
        imageData: imageUrl
      });
    }

    setSlides(generatedSlides);
    setCurrentSlideIndex(0);
    setStep('editor');
  };

  // Single-slide image regeneration in the primary canvas editor
  const handleSingleImageRegenerate = async (slideIdx: number) => {
    const slideToUpdate = slides[slideIdx];
    setSlides(prev => prev.map((s, i) => i === slideIdx ? { ...s, isGeneratingImage: true } : s));

    try {
      const imgResult = await generateOrGetImage(
        slideToUpdate.title,
        slideToUpdate.visualPrompt || slideToUpdate.title,
        slideToUpdate.type,
        theme.name,
        theme.accent,
        imageSourceMode
      );

      if (imgResult) {
        setSlides(prev => prev.map((s, i) => i === slideIdx ? { ...s, imageData: imgResult.url, isGeneratingImage: false } : s));
      } else {
        setSlides(prev => prev.map((s, i) => i === slideIdx ? { ...s, isGeneratingImage: false } : s));
        alert('Could not generate or find a matching image for this slide query.');
      }
    } catch (e) {
      console.error(e);
      setSlides(prev => prev.map((s, i) => i === slideIdx ? { ...s, isGeneratingImage: false } : s));
      alert('Error regenerating slide image.');
    }
  };

  // Video Export trigger using the ref print-container elements
  const handleVideoExport = async () => {
    if (!printContainerRef.current) return;
    
    const slideElements = Array.from(
      printContainerRef.current.querySelectorAll<HTMLElement>('.slide-to-record')
    );

    if (slideElements.length === 0) {
      alert("No slides rendered to record.");
      return;
    }

    setIsExportingVideo(true);
    setVideoExportProgress(0);
    setVideoExportMessage('Initializing presentation video capture...');
    videoCancelRef.current = false;

    try {
      const videoBlob = await exportDeckToVideo(
        slideElements,
        {
          secondsPerSlide: 4, // 4 seconds transition time
          width: 1280,
          height: 720,
          fps: 30,
          bitrate: 5000000 // 5 Mbps High Quality
        },
        (current, total, msg) => {
          setVideoExportMessage(msg);
          setVideoExportProgress(Math.round((current / total) * 100));
        },
        () => videoCancelRef.current
      );

      // Create download link
      const url = URL.createObjectURL(videoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${user?.businessName || 'Business'}_Presenter_Video.${videoBlob.type.includes('mp4') ? 'mp4' : 'webm'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (err: any) {
      console.error('Video export error:', err);
      if (err.message !== 'Video generation cancelled by user.') {
        alert(`Failed to export video presentation: ${err.message}`);
      }
    } finally {
      setIsExportingVideo(false);
    }
  };

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
        const customTheme = {
          id: 'custom-brand',
          name: 'Custom Brand',
          bg: `bg-[#0a0a1a]`, // dark background base
          accent: `text-[${data.primaryColor}]`,
          border: `border-[${data.primaryColor}]/30`,
          font: data.font || 'font-sans',
          graphColor: data.primaryColor
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

  const handlePrint = () => {
    window.print();
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
          .bg-\\[\\#0a0a1a\\] { background-color: #0a0a1a !important; }
          .bg-\\[\\#051a05\\] { background-color: #051a05 !important; }
          .bg-\\[\\#1a051a\\] { background-color: #1a051a !important; }
        }
      `}</style>

      {/* Hidden Container for Printing & Video Capturing */}
      {step === 'editor' && (
        <div ref={printContainerRef} className="print-container fixed inset-0 pointer-events-none opacity-0 z-[-1]">
          {slides.map((slide, idx) => (
            <div key={idx} className="print-slide slide-to-record" style={{ width: '1280px', height: '720px' }}>
              <SlideRenderer slide={slide} theme={theme} index={idx} total={slides.length} />
            </div>
          ))}
        </div>
      )}

      {/* Video Capturing Progress Modal Overlay */}
      {isExportingVideo && (
        <div className="fixed inset-0 z-[300] bg-black/90 flex flex-col items-center justify-center p-6 backdrop-blur-sm">
          <div className="w-full max-w-md p-8 rounded-3xl bg-white/5 border border-white/10 text-center space-y-6">
            <Film size={48} className="text-cyan-400 mx-auto animate-pulse" />
            
            <div className="space-y-2">
              <h3 className="text-lg font-black text-white">Exporting Video Presentation</h3>
              <p className="text-xs text-gray-400 leading-relaxed">{videoExportMessage}</p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300" 
                  style={{ width: `${videoExportProgress}%` }}
                />
              </div>
              <span className="text-xs font-mono text-cyan-400">{videoExportProgress}% Completed</span>
            </div>

            <button
              onClick={() => { videoCancelRef.current = true; }}
              className="w-full py-2.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 font-bold rounded-xl text-xs transition-colors"
            >
              Cancel Video Capture
            </button>
          </div>
        </div>
      )}

      {/* Main UI Container */}
      <div className="relative w-full max-w-7xl h-[90vh] bg-[#050510] rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden flex no-print">
        
        {step !== 'outline-review' && (
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 z-50 p-2 rounded-full bg-black/50 hover:bg-white/20 text-white transition-all"
          >
            <X size={24} />
          </button>
        )}

        {/* Phase 1: Selective document ingest and generation parameters */}
        {step === 'select' && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center overflow-y-auto custom-scrollbar">
            <div className="w-20 h-20 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-cyan-500/20">
              <Layout size={40} className="text-white" />
            </div>
            
            <h2 className="text-3xl font-black mb-2">Gamma-UX Presentation Designer</h2>
            <p className="text-gray-400 max-w-md mb-8 text-sm">
              Convert your South African business plans into dynamic, high-impact investor pitch decks using our three-phase layout generator.
            </p>

            {/* Generator Settings Card */}
            <div className="w-full max-w-xl p-6 bg-white/5 border border-white/10 rounded-2xl mb-8 text-left space-y-4">
              <div className="flex items-center gap-2 text-xs font-black text-cyan-400 uppercase tracking-widest border-b border-white/5 pb-2">
                <Settings size={14} /> Generator Settings
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Strategy Picker */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Pitch Framework</label>
                  <select
                    value={selectedStrategyId}
                    onChange={(e) => setSelectedStrategyId(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer focus:border-cyan-500"
                  >
                    {PITCH_STRATEGIES.map(s => (
                      <option key={s.id} value={s.id} className="bg-[#050510]">{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Image source fallback */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Image Fallback Protocol</label>
                  <select
                    value={imageSourceMode}
                    onChange={(e) => setImageSourceMode(e.target.value as ImageSourceMode)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none cursor-pointer focus:border-cyan-500"
                  >
                    <option value="auto" className="bg-[#050510]">Auto (Gemini Imagen 3.0 + Stock Fallback)</option>
                    <option value="ai" className="bg-[#050510]">AI Only (Strict Imagen 3.0)</option>
                    <option value="stock" className="bg-[#050510]">Stock Photos Only (Pexels / Pixabay)</option>
                  </select>
                </div>
              </div>
            </div>

            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-4">Select Source Intelligence Document</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
              {documents.length > 0 ? (
                documents.map(doc => (
                  <button 
                    key={doc.id}
                    onClick={() => handleDocSelected(doc)}
                    className="p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/50 transition-all group text-left flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-cyan-400 group-hover:scale-110 transition-all">
                      <Wand2 size={20} />
                    </div>
                    <div className="truncate flex-1">
                      <h4 className="font-bold text-sm text-white group-hover:text-cyan-400 transition-colors truncate">{doc.name}</h4>
                      <p className="text-[10px] text-gray-500">Business Plan Source • {PITCH_STRATEGIES.find(s => s.id === selectedStrategyId)?.name.split(' ')[0]} layout</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="col-span-2 p-8 rounded-2xl border border-dashed border-white/20 text-gray-500 text-sm">
                  No business intelligence documents detected. Please generate a Business Plan document in the workspace first.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Phase 1: Outline-first loading step */}
        {step === 'generating-outline' && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-6">
            <Loader2 size={56} className="text-cyan-400 animate-spin" />
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white animate-pulse">Structuring Draft Presentation</h3>
              <p className="text-sm text-gray-400 max-w-lg leading-relaxed">{loadingMessage}</p>
            </div>
          </div>
        )}

        {/* Phase 2: Interactive Outline Review panel */}
        {step === 'outline-review' && (
          <OutlineEditor
            businessName={user?.businessName || 'Your Startup'}
            docName={selectedDoc?.name || 'Business Plan'}
            docContent={selectedDoc?.content || ''}
            initialOutline={outline}
            onGenerate={handleFinalOutlineConfirmed}
            onBack={() => setStep('select')}
            onStrategyChange={handleStrategyChange}
            currentStrategyId={selectedStrategyId}
          />
        )}

        {/* Phase 3: Slide Deck Realization Progress step */}
        {step === 'generating-deck' && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-8">
            <Loader2 size={56} className="text-purple-400 animate-spin" />
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white">Realizing Slide Presentation</h3>
              <p className="text-xs text-gray-400 leading-relaxed max-w-md">{loadingMessage}</p>
            </div>

            {/* Progress status indicators */}
            <div className="w-full max-w-xs space-y-1">
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-300" 
                  style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-purple-400">Rendering slide {generationProgress.current} of {generationProgress.total}</span>
            </div>
          </div>
        )}

        {/* Phase 3: The Canvas Editor Workspace */}
        {step === 'editor' && (
          <div className="flex-1 flex flex-col md:flex-row h-full">
            {/* Sidebar Controls */}
            <div className="w-full md:w-80 bg-[#0a0a1a] border-r border-white/10 p-5 flex flex-col h-full overflow-y-auto custom-scrollbar z-20">
              
              {/* Theme Settings block */}
              <div className="mb-6">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
                  <Palette size={14} className="text-cyan-400" /> Deck Aesthetics
                </h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {THEMES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${t.id === theme.id ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                      style={{ backgroundColor: t.id === 'modern' ? '#0a0a1a' : t.id === 'eco' ? '#051a05' : t.id === 'custom-brand' ? t.graphColor : '#1a051a' }}
                      title={t.name}
                    />
                  ))}
                </div>
                <button
                  onClick={handleBrandSync}
                  disabled={syncingBrand}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-xs text-cyan-400 border border-cyan-500/30 transition-colors"
                >
                  {syncingBrand ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                  {syncingBrand ? 'Syncing...' : 'Sync website design (URL)'}
                </button>
              </div>

              {/* Slide Selector */}
              <div className="flex-1 flex flex-col min-h-0">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
                  <Layout size={14} className="text-cyan-400" /> Slides ({slides.length})
                </h3>
                <div className="space-y-2 overflow-y-auto flex-1 pr-1 custom-scrollbar">
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
                      <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5 opacity-60">Slide {idx + 1} • {slide.type}</p>
                      <p className="text-xs font-black truncate">{slide.title}</p>
                      
                      {slide.isGeneratingImage && (
                        <div className="absolute top-2 right-2">
                          <Loader2 size={10} className="animate-spin text-cyan-400" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Exporters and PPTX Settings panel */}
              <div className="mt-5 pt-5 border-t border-white/10 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">PPTX Brand Template</label>
                  <select 
                    value={presentonTemplate}
                    onChange={(e) => setPresentonTemplate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white font-medium focus:border-purple-500 transition-colors outline-none cursor-pointer"
                  >
                    <option value="stacfund-template" className="bg-[#050510]">StacFund Investor (Default)</option>
                    <option value="mint-blue" className="bg-[#050510]">Mint Blue</option>
                    <option value="edge-yellow" className="bg-[#050510]">Edge Yellow</option>
                    <option value="light-rose" className="bg-[#050510]">Light Rose</option>
                    <option value="professional-blue" className="bg-[#050510]">Professional Blue</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <button 
                    onClick={async () => {
                      try {
                        const doc = selectedDoc || documents[0];
                        if (!doc) {
                          alert("Could not find source document for this presentation.");
                          return;
                        }

                        const response = await fetch("/api/presenton/generate", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            businessPlan: doc.content || doc.name,
                            template: presentonTemplate,
                            deckType: "Investor Pitch Deck"
                          })
                        });

                        if (!response.ok) throw new Error("Failed to generate professional deck");
                        
                        const result = await response.json();
                        if (result.downloadUrl) {
                          window.open(result.downloadUrl, "_blank");
                        } else if (result.pptxUrl) {
                          window.open(result.pptxUrl, "_blank");
                        } else {
                           alert("Deck generated, but no download URL returned.");
                        }
                      } catch (error) {
                        console.error(error);
                        alert("Error connecting to Presenton service. Make sure it is running.");
                      }
                    }}
                    className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-purple-600/20 active:scale-95"
                  >
                    <Sparkles size={14} /> Export PPTX Presentation
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={handlePrint}
                      className="py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-cyan-500/20 active:scale-95"
                    >
                      <Download size={12} /> Save PDF
                    </button>

                    <button 
                      onClick={handleVideoExport}
                      className="py-2.5 bg-[#00f2fe]/15 hover:bg-[#00f2fe]/30 border border-[#00f2fe]/40 text-[#00f2fe] font-black rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-all active:scale-95"
                      title="Capture entire slide presentation as WebM/MP4 video"
                    >
                      <Film size={12} /> Save Video
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl items-start">
                  <AlertCircle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-[9px] text-yellow-300/80 leading-relaxed">
                    Save PDF includes full graphic compositions. Select "Save as PDF" and "Landscape orientation" in the native dialog.
                  </p>
                </div>
              </div>
            </div>

            {/* Canvas Playback Area */}
            <div className="flex-1 bg-[#0b0b18] relative flex items-center justify-center p-8 overflow-hidden">
               
               {/* Slide Image Re-roll Pill */}
               {['cover', 'data', 'content'].includes(slides[currentSlideIndex]?.type) && (
                 <button
                   onClick={() => handleSingleImageRegenerate(currentSlideIndex)}
                   disabled={slides[currentSlideIndex]?.isGeneratingImage}
                   className="absolute top-6 left-6 z-40 flex items-center gap-1.5 px-3 py-1.5 bg-black/60 hover:bg-white/10 border border-white/10 text-xs text-cyan-400 font-bold rounded-full transition-colors backdrop-blur-md disabled:opacity-50"
                 >
                   <RefreshCw size={12} className={slides[currentSlideIndex]?.isGeneratingImage ? 'animate-spin' : ''} />
                   {slides[currentSlideIndex]?.isGeneratingImage ? 'Generating Graphic...' : 'Regenerate Graphic'}
                 </button>
               )}

               {/* Previous/Next Overlays */}
               <button 
                 onClick={() => setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1))}
                 disabled={currentSlideIndex === 0}
                 className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-white/20 text-white disabled:opacity-0 border border-white/10 transition-all z-30"
               >
                 <ChevronLeft size={20} />
               </button>
               <button 
                 onClick={() => setCurrentSlideIndex(Math.min(slides.length - 1, currentSlideIndex + 1))}
                 disabled={currentSlideIndex === slides.length - 1}
                 className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-white/20 text-white disabled:opacity-0 border border-white/10 transition-all z-30"
               >
                 <ChevronRight size={20} />
               </button>

               {/* Active Slide Canvas Stage */}
               <div className="aspect-video w-full max-w-4xl shadow-2xl transition-all duration-500 transform relative border border-white/10 rounded-2xl overflow-hidden bg-black">
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
    </div>
  );
};

export default PresentationDesigner;
export { SlideRenderer };
