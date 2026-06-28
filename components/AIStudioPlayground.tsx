import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Wand2, Loader2, FileText, Presentation, ChevronDown } from 'lucide-react';

export default function AIStudioPlayground({ onGenerate, isLoading }: { onGenerate: (prompt: string, docType: string, template: string) => void, isLoading: boolean }) {
  const [prompt, setPrompt] = useState('');
  const [docType, setDocType] = useState('pitch');
  const [selectedTemplate, setSelectedTemplate] = useState('gamma_visual');

  return (
    <div className="min-h-screen w-full p-4 sm:p-8 md:p-16 relative overflow-hidden bg-[#050510]">
      <div className="absolute top-0 left-1/4 w-[300px] h-[300px] md:w-[500px] md:h-[500px] bg-purple-600/10 rounded-full blur-[100px] md:blur-[120px] pointer-events-none"></div>
      <div className="max-w-4xl mx-auto relative z-10 py-8 md:py-0">
        <div className="text-center mb-8 md:mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 md:px-4 md:py-1.5 bg-white/5 border border-white/10 rounded-full text-[10px] md:text-xs font-bold text-purple-300 uppercase tracking-widest mb-4 md:mb-6">
            <Sparkles size={12} /> AI Document Studio
          </div>
          <h1 className="text-3xl md:text-6xl font-black text-white mb-2 md:mb-4 tracking-tight px-4">What shall we build today?</h1>
          <p className="text-gray-400 text-sm md:text-lg px-6">Describe your vision. Our AI will craft a flawless document.</p>
        </div>
        <div className="glass-panel rounded-2xl md:rounded-[2rem] p-1.5 md:p-2 border border-white/10 shadow-2xl mb-4 md:mb-6">
          <textarea 
            value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Generate a pitch deck for Nawi-Learn Toddler Centre..."
            className="w-full bg-transparent p-4 md:p-6 text-white placeholder-gray-500 focus:outline-none resize-none h-32 md:h-40 text-base md:text-lg font-medium"
          />
          <div className="flex flex-col gap-3 p-3 md:p-4 border-t border-white/5">
            <div className="grid grid-cols-2 gap-2 w-full">
              <button onClick={() => setDocType('pitch')} className={`px-3 py-2.5 md:px-4 md:py-3 rounded-xl font-bold text-xs md:text-sm transition-all flex items-center justify-center gap-2 ${docType === 'pitch' ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400'}`}>
                <Presentation size={16} /> Pitch Deck
              </button>
              <button onClick={() => setDocType('plan')} className={`px-3 py-2.5 md:px-4 md:py-3 rounded-xl font-bold text-xs md:text-sm transition-all flex items-center justify-center gap-2 ${docType === 'plan' ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400'}`}>
                <FileText size={16} /> Business Plan
              </button>
            </div>
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
              <div className="relative flex-1">
                <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)} className="w-full appearance-none bg-white/5 border border-white/10 text-white text-xs md:text-sm rounded-xl px-4 py-3 md:py-2.5 focus:outline-none cursor-pointer">
                  <option value="gamma_visual" className="bg-[#0a0a1a]">Gamma Visual Template</option>
                  <option value="venturekit_pro" className="bg-[#0a0a1a]">Venturekit Pro Template</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
              </div>
              <button onClick={() => onGenerate(prompt, docType, selectedTemplate)} disabled={isLoading || !prompt.trim()} className="w-full md:w-auto px-6 py-3 md:px-8 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl font-black text-white hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2 text-sm md:text-base">
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />} Generate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
