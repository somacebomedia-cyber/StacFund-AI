
import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Layout, Image as ImageIcon, Download, ChevronLeft, ChevronRight, Palette, Wand2, Loader2, Printer, Type as TypeIcon, PieChart } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { handleGeminiError } from '../services/geminiError';
import { User, AppDocument } from '../types';

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

// Helper to render slide content (used for both Editor and Print view)
const SlideRenderer = ({ slide, theme, index, total }: { slide: Slide, theme: typeof THEMES[0], index: number, total: number }) => (
  <div className={`w-full h-full ${theme.bg} relative overflow-hidden flex flex-col p-8 md:p-16 border-4 ${theme.border}`}>
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
      
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
              <h1 className={`text-6xl md:text-7xl font-black mb-8 leading-tight ${theme.font} text-white drop-shadow-2xl`}>{slide.title}</h1>
              <p className={`text-2xl font-medium opacity-90 ${theme.accent}`}>{slide.points[0] || 'Business Overview'}</p>
            </div>
        </div>
      ) : slide.type === 'data' ? (
        <div className="flex-1 flex flex-col relative z-10">
            <h2 className={`text-5xl font-black mb-12 ${theme.font} text-white border-b border-white/10 pb-6`}>{slide.title}</h2>
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
            <blockquote className={`text-4xl md:text-5xl font-medium text-center leading-relaxed ${theme.font} text-white italic max-w-4xl`}>
              {slide.title}
            </blockquote>
             <div className="text-8xl opacity-20 font-serif absolute bottom-10 right-10">"</div>
             <div className={`mt-12 w-24 h-1 ${theme.accent.replace('text-', 'bg-')}`}></div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col relative z-10">
            <div className={`w-20 h-2 rounded-full mb-8 ${theme.accent.replace('text-', 'bg-')}`}></div>
            <h2 className={`text-5xl font-black mb-12 ${theme.font} text-white`}>{slide.title}</h2>
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
          <p className="text-sm font-black uppercase tracking-widest text-white">StacFund Generated</p>
          <p className="text-sm font-black uppercase tracking-widest text-white">{index + 1} / {total}</p>
      </div>
  </div>
);

const PresentationDesigner: React.FC<PresentationDesignerProps> = ({ user, onClose }) => {
  const [step, setStep] = useState<'select' | 'generating' | 'editor'>('select');
  const [documents, setDocuments] = useState<AppDocument[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [theme, setTheme] = useState(THEMES[0]);
  const [loadingMessage, setLoadingMessage] = useState('');

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

  const generatePresentation = async (doc: AppDocument) => {
    setStep('generating');
    setLoadingMessage('Designing presentation structure...');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'proxy', httpOptions: { baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:3000/api/gemini' } });
      
      const prompt = `
        Create a 5-7 slide presentation structure for a business document titled "${doc.name}".
        Business Name: ${user?.businessName}
        
        OUTPUT FORMAT: JSON Array of Slide objects.
        Slide Types: 'cover', 'content', 'data', 'quote'.
        
        For each slide, include a 'visualPrompt' field describing a specific image (illustration, chart, or icon) that matches the slide content.
        For 'data' slides, describe an infographic.
        For 'cover', describe a heroic business illustration.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['cover', 'content', 'data', 'quote'] },
                title: { type: Type.STRING },
                points: { type: Type.ARRAY, items: { type: Type.STRING } },
                visualPrompt: { type: Type.STRING }
              }
            }
          }
        }
      });

      const generatedSlides = JSON.parse(response.text || '[]');
      const slidesWithIds = generatedSlides.map((s: any, i: number) => ({ ...s, id: i.toString(), isGeneratingImage: false }));
      setSlides(slidesWithIds);
      setStep('editor');

      // Trigger background image generation for Cover and Data slides primarily
      slidesWithIds.forEach((slide: Slide, index: number) => {
        if (['cover', 'data', 'content'].includes(slide.type)) {
           generateSlideImage(slide, index);
        }
      });

    } catch (error) {
      
      handleGeminiError(error);
      alert('Failed to generate presentation. Please try again.');
      setStep('select');
    }
  };

  const generateSlideImage = async (slide: Slide, index: number) => {
    // Optimistic update to show loading state if we had UI for it
    setSlides(prev => prev.map((s, i) => i === index ? { ...s, isGeneratingImage: true } : s));

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'proxy', httpOptions: { baseUrl: typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:3000/api/gemini' } });
      
      let stylePrompt = `Style: High quality, professional, vector art, flat design, ${theme.name} color palette (${theme.accent} accent).`;
      if (slide.type === 'data') stylePrompt += " Create a clean, modern infographic chart visualization on a dark background.";
      if (slide.type === 'cover') stylePrompt += " Heroic, cinematic composition, minimalist.";
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: `${slide.visualPrompt || slide.title}. ${stylePrompt}` }]
        }
      });

      let imageUrl = null;
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (imageUrl) {
        setSlides(prev => prev.map((s, i) => i === index ? { ...s, imageData: imageUrl, isGeneratingImage: false } : s));
      }
    } catch (e) {
      
      handleGeminiError(e);
      setSlides(prev => prev.map((s, i) => i === index ? { ...s, isGeneratingImage: false } : s));
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
              Transform your boring text documents into stunning, investor-ready presentations with AI-generated visuals.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
              {documents.length > 0 ? (
                documents.map(doc => (
                  <button 
                    key={doc.id}
                    onClick={() => generatePresentation(doc)}
                    className="p-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/50 transition-all group text-left flex items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-cyan-400 group-hover:scale-110 transition-all">
                      <Wand2 size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white group-hover:text-cyan-400 transition-colors truncate w-48">{doc.name}</h4>
                      <p className="text-xs text-gray-500">AI Generated • Text</p>
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
            <p className="text-gray-500 mt-2">Creating structure and generating initial graphics...</p>
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
                <div className="flex gap-2">
                  {THEMES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t)}
                      className={`w-10 h-10 rounded-full border-2 transition-all ${t.id === theme.id ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                      style={{ backgroundColor: t.id === 'modern' ? '#0a0a1a' : t.id === 'eco' ? '#051a05' : '#1a051a' }}
                      title={t.name}
                    />
                  ))}
                </div>
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
                <button 
                  onClick={handlePrint}
                  className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-500/20"
                >
                  <Download size={18} /> Export PDF
                </button>
                <p className="text-[10px] text-gray-500 text-center mt-3">
                  Includes all AI-generated graphics. Select "Save as PDF" in the print dialog.
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
                 <SlideRenderer slide={slides[currentSlideIndex]} theme={theme} index={currentSlideIndex} total={slides.length} />
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PresentationDesigner;
