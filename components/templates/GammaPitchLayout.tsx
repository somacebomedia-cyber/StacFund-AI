import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, X, Download } from 'lucide-react';

export default function GammaPitchLayout({ data, businessInfo, onClose }: { data: any, businessInfo: any, onClose: () => void }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = [
    { content: (
      <div className="flex flex-col h-full justify-center items-center text-center bg-gradient-to-br from-purple-700 to-indigo-900 text-white p-6 md:p-12">
        <h1 className="text-3xl md:text-6xl font-black mb-2 md:mb-4">{businessInfo.name || businessInfo.businessName || 'Business Name'}</h1>
        <p className="text-lg md:text-2xl font-light text-purple-200">Funding Proposal</p>
      </div>
    )},
    { content: (
      <div className="flex flex-col h-full justify-center p-6 md:p-16 bg-white text-gray-900 overflow-y-auto">
        <h2 className="text-2xl md:text-4xl font-black mb-3 md:mb-6 text-purple-600">The Challenge</h2>
        <p className="text-sm md:text-xl leading-relaxed text-gray-700">{data?.executiveSummary}</p>
      </div>
    )},
    { content: (
      <div className="flex flex-col h-full justify-center p-6 md:p-16 bg-purple-900 text-white overflow-y-auto">
        <h2 className="text-2xl md:text-4xl font-black mb-4 md:mb-8">Capital Required</h2>
        <div className="bg-white/10 backdrop-blur-md p-4 md:p-8 rounded-2xl md:rounded-3xl border border-white/20">
          {data?.financialPlan?.useOfFunds?.map((item: any, i: number) => (
            <div key={i} className="flex justify-between items-center border-b border-white/10 py-3 md:py-6">
              <p className="text-sm md:text-xl font-bold pr-2">{item.category || item.item}</p>
              <p className="text-base md:text-2xl font-black text-emerald-400">{item.amount}</p>
            </div>
          ))}
          <div className="mt-4 md:mt-8 text-right">
            <p className="text-[10px] md:text-sm text-purple-300 uppercase tracking-widest">Total Requested</p>
            <p className="text-2xl md:text-5xl font-black text-emerald-400">{data?.financialPlan?.fundingRequirement || data?.financialPlan?.totalRequested}</p>
          </div>
        </div>
      </div>
    )}
  ];

  return (
    <div className="fixed inset-0 z-[200] bg-[#050510] flex flex-col items-center justify-between p-4 md:p-8">
      <div className="w-full max-w-5xl flex justify-between items-center z-50 mt-2">
        <div className="glass-panel px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-white/10">
          <span className="font-bold text-xs md:text-sm text-white">{businessInfo.name || businessInfo.businessName || 'Proposal'}</span>
        </div>
        <div className="flex gap-2 md:gap-4">
          <button className="p-2.5 md:p-3 glass-panel hover:bg-white/10 text-white rounded-xl border border-white/10"><Download size={18} className="md:hidden" /><Download size={20} className="hidden md:block" /></button>
          <button onClick={onClose} className="p-2.5 md:p-3 glass-panel hover:bg-white/10 text-white rounded-xl border border-white/10"><X size={18} className="md:hidden" /><X size={20} className="hidden md:block" /></button>
        </div>
      </div>
      <div className="relative w-full max-w-5xl h-[70vh] md:h-[80vh] rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl border border-white/10">
        <AnimatePresence mode="wait">
          <motion.div key={currentSlide} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} transition={{ duration: 0.3 }} className="w-full h-full">
            {slides[currentSlide].content}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-4 md:gap-8 mb-2 md:mb-0 text-white">
        <button onClick={() => setCurrentSlide(p => (p - 1 + slides.length) % slides.length)} className="p-3 glass-panel hover:bg-white/10 rounded-full border border-white/10 active:scale-90"><ChevronLeft size={24} /></button>
        <div className="flex gap-1.5 md:gap-2">
          {slides.map((_, i) => <div key={i} className={`h-2 rounded-full transition-all ${i === currentSlide ? 'bg-white w-6 md:w-8' : 'bg-white/30 w-2'}`} />)}
        </div>
        <button onClick={() => setCurrentSlide(p => (p + 1) % slides.length)} className="p-3 glass-panel hover:bg-white/10 rounded-full border border-white/10 active:scale-90"><ChevronRight size={24} /></button>
      </div>
    </div>
  );
}
