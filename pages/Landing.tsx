import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useScroll, useTransform, AnimatePresence } from 'motion/react';
import { ArrowRight, Search, Banknote, Users, Clock, Zap, FolderUp, Radar, Rocket, ShieldCheck, FileText, Target, MessageSquare, Presentation, Brush, Megaphone, CheckCircle2, Lock, Plus, Image as ImageIcon, ThumbsUp, Send } from 'lucide-react';

interface LandingProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onSearchFunding: () => void;
}

// ─── Custom Logo ──────────────────────────────────────────────────────
const StacFundLogo = ({ size = 40 }: { size?: number }) => (
  <img 
    src="https://plain-apac-prod-public.komododecks.com/202605/18/MVQzOoGi4sCDyhKzfhaM/image.png" 
    alt="StacFund Logo" 
    referrerPolicy="no-referrer"
    style={{ width: size, height: size, objectFit: 'contain' }}
  />
);

// ─── Background ───────────────────────────────────────────────────────────────
const CleanBackground = () => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <div 
        className="absolute inset-0 bg-center bg-cover bg-no-repeat"
        style={{ backgroundImage: "linear-gradient(rgba(5, 5, 10, 0.75), rgba(5, 5, 10, 0.75)), url('/src/assets/images/astronaut_background_png_1779097044670.png')" }}
      />
    </div>
  );
};

// ─── Custom 3D CSS iPhone Mockup ──────────────────────────────────────────────
const FeatureScreenshot = ({ i }: { i: number }) => {
  switch(i) {
    case 0: // Vault
      return (
        <div className="h-full flex flex-col pt-4">
          <div className="flex justify-between items-center mb-6">
            <h4 className="font-bold text-lg">Secure Vault</h4>
            <ShieldCheck size={20} className="text-emerald-400" />
          </div>
          <div className="flex-1 space-y-4">
            {[1, 2, 3].map(n => (
              <div key={n} className="bg-white/10 p-3 rounded-xl flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg"><Lock size={16} className="text-emerald-400" /></div>
                <div className="flex-1">
                  <div className="h-2 w-20 bg-white/40 rounded mb-1" />
                  <div className="h-1.5 w-12 bg-white/20 rounded" />
                </div>
                <CheckCircle2 size={16} className="text-emerald-500" />
              </div>
            ))}
          </div>
          <button className="mt-auto w-full py-3 rounded-xl bg-emerald-500 font-bold text-sm tracking-wide">Upload Document</button>
        </div>
      );
    case 1: // Match
      return (
         <div className="h-full flex flex-col justify-center items-center">
            <div className="relative w-40 h-40 flex items-center justify-center">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: 'linear' }} className="absolute inset-0 rounded-full border-2 border-dashed border-blue-500/50" />
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }} className="absolute w-24 h-24 rounded-full bg-blue-500/20" />
              <div className="text-center relative z-10">
                <p className="text-3xl font-black text-blue-400">98%</p>
                <p className="text-xs font-bold text-white/50 uppercase mt-1">Match</p>
              </div>
            </div>
            <div className="mt-8 w-full bg-white/10 p-4 rounded-2xl">
              <h5 className="font-bold text-sm mb-1">NYDA Youth Fund</h5>
              <p className="text-xs text-white/50 mb-3">R250,000 Available</p>
              <button className="w-full py-2 bg-blue-500 rounded-lg text-xs font-bold">Review Terms</button>
            </div>
         </div>
      );
    case 2: // Motivations
      return (
        <div className="h-full flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Rocket size={18} className="text-purple-400" />
            <h4 className="font-bold">Cover Letter</h4>
          </div>
          <div className="flex-1 bg-white/5 border border-white/10 rounded-xl p-4 relative overflow-hidden">
             <motion.div 
                initial={{ height: 10 }}
                animate={{ height: "100%" }}
                transition={{ duration: 3, repeat: Infinity, repeatType: 'reverse' }}
                className="absolute top-0 left-0 w-1 bg-purple-500"
             />
             <div className="space-y-3">
               <div className="h-2 w-full bg-white/20 rounded" />
               <div className="h-2 w-11/12 bg-white/20 rounded" />
               <div className="h-2 w-full bg-white/20 rounded" />
               <div className="h-2 w-3/4 bg-white/20 rounded" />
               <div className="h-2 w-full bg-purple-400/50 rounded" />
               <div className="h-2 w-5/6 bg-purple-400/50 rounded" />
             </div>
          </div>
        </div>
      );
    case 3: // Auto Fill
      return (
        <div className="h-full flex flex-col justify-center">
          <div className="text-center mb-6">
            <Target size={32} className="text-pink-400 mx-auto mb-2" />
            <h4 className="font-bold">Auto-Filling Form</h4>
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((n, idx) => (
              <div key={n} className="flex flex-col gap-1">
                <div className="h-2 w-16 bg-white/30 rounded" />
                <div className="h-8 bg-white/10 border border-pink-500/30 rounded-lg flex items-center px-3 justify-between">
                  <div className="h-1.5 w-24 bg-pink-400/60 rounded" />
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: idx * 0.2 }}>
                    <CheckCircle2 size={14} className="text-pink-400" />
                  </motion.div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case 4: // AI Advisor
      return (
        <div className="h-full flex flex-col justify-end">
           <div className="flex-1 flex flex-col gap-4 py-4 overflow-hidden">
             <div className="self-end bg-cyan-500 p-3 rounded-2xl rounded-tr-sm max-w-[80%]">
               <div className="h-1.5 w-24 bg-white/80 rounded mb-1" />
               <div className="h-1.5 w-16 bg-white/80 rounded" />
             </div>
             <div className="self-start bg-white/10 p-3 rounded-2xl rounded-tl-sm max-w-[80%]">
               <div className="h-1.5 w-32 bg-cyan-400/60 rounded mb-1.5" />
               <div className="h-1.5 w-24 bg-cyan-400/60 rounded mb-1.5" />
               <div className="h-1.5 w-20 bg-cyan-400/60 rounded" />
             </div>
             <div className="self-end bg-cyan-500 p-3 rounded-2xl rounded-tr-sm max-w-[80%]">
               <div className="h-1.5 w-12 bg-white/80 rounded" />
             </div>
           </div>
           <div className="h-12 border border-white/20 rounded-full flex items-center px-4 justify-between mt-2">
             <div className="h-2 w-24 bg-white/20 rounded" />
             <Send size={16} className="text-cyan-400" />
           </div>
        </div>
      );
    case 5: // Pitch
      return (
        <div className="h-full flex flex-col">
          <h4 className="font-bold text-center mb-4">Deck Preview</h4>
          <div className="flex-1 bg-white/5 border border-indigo-500/30 rounded-xl overflow-hidden flex flex-col">
            <div className="h-1/2 bg-indigo-500/20 flex items-center justify-center p-4">
               <div className="w-full h-full border border-indigo-400/50 rounded flex items-center justify-center"><Presentation size={24} className="text-indigo-400" /></div>
            </div>
            <div className="p-4 flex-1">
              <div className="h-2 w-20 bg-indigo-400 rounded mb-3" />
              <div className="h-1 w-full bg-white/30 rounded mb-1.5" />
              <div className="h-1 w-5/6 bg-white/30 rounded mb-1.5" />
              <div className="h-1 w-4/6 bg-white/30 rounded" />
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-center">
            {[1,2,3,4].map((n) => (
              <div key={n} className={"w-1.5 h-1.5 rounded-full " + (n === 1 ? "bg-indigo-400" : "bg-white/20")} />
            ))}
          </div>
        </div>
      );
    case 6: // Brand
      return (
        <div className="h-full flex flex-col">
           <h4 className="font-bold text-center mb-6">Generated Assets</h4>
           <div className="pr-2 grid grid-cols-2 gap-3 mb-4">
              <div className="aspect-square rounded-xl bg-orange-500 flex items-center justify-center"><Brush size={24} /></div>
              <div className="aspect-square rounded-xl bg-white/10 flex items-center justify-center font-black text-xl italic text-orange-400">Abc</div>
           </div>
           <div className="flex gap-2 mb-4">
             {['#f97316', '#c2410c', '#ffffff', '#000000'].map(val => (
               <div key={val} className="w-8 h-8 rounded-full border-2 border-white/10 shadow-lg" style={{ backgroundColor: val }} />
             ))}
           </div>
           <button className="w-full py-2.5 rounded-lg bg-orange-500 font-bold text-xs mt-auto">Download Kit</button>
        </div>
      );
    case 7: // Ad
      return (
        <div className="h-full">
           <div className="bg-white text-black rounded-xl overflow-hidden shadow-xl shrink-0">
             <div className="p-3 flex items-center gap-2">
               <div className="w-6 h-6 rounded-full bg-red-500" />
               <div className="font-bold text-[10px]">Sponsored</div>
             </div>
             <div className="aspect-video bg-red-100 flex items-center justify-center">
               <ImageIcon size={32} className="text-red-400" />
             </div>
             <div className="p-3">
               <div className="h-1.5 w-full bg-gray-200 rounded mb-1" />
               <div className="h-1.5 w-2/3 bg-gray-200 rounded mb-3" />
               <div className="flex justify-between items-center">
                 <div className="flex gap-1 text-gray-500"><ThumbsUp size={12} /><span className="text-[9px] font-bold">12k</span></div>
                 <div className="bg-red-500 text-white text-[9px] font-bold px-2 py-1 rounded">Sign Up</div>
               </div>
             </div>
           </div>
           <div className="mt-4 bg-white/10 rounded-xl p-3 flex justify-between items-center">
             <div>
               <div className="text-[10px] text-white/50">Est. Conversions</div>
               <div className="font-bold text-red-400">4.5% - 6.0%</div>
             </div>
             <Rocket size={16} className="text-red-500" />
           </div>
        </div>
      );
    default: return null;
  }
}

const IPhone17Model = ({ i, colorHex, frameHex, animated = true }: { i: number, colorHex: string, frameHex: string, animated?: boolean }) => {
  const zDepth = 6;

  return (
        <motion.div 
            animate={animated ? { y: [0, -15, 0] } : { y: 0 }}
            transition={{ y: { duration: 4, repeat: Infinity, ease: 'easeInOut' } }} // Floating
            style={{ width: '100%', height: '100%', transformStyle: 'preserve-3d', willChange: 'transform' }}
        >
            {/* Layers for true 3D edge depth */}
            {Array.from({ length: zDepth }).map((_, idx) => (
               <div 
                 key={idx}
                 className="absolute inset-0 rounded-[3.5rem] pointer-events-none"
                 style={{ 
                   transform: "translateZ(" + (-idx) + "px)",
                   backgroundColor: idx === zDepth - 1 ? colorHex : frameHex,
                   opacity: idx === 0 ? 0 : 1, // Let layer 0 be the screen transparent
                   boxShadow: idx === zDepth - 1 ? "0 20px 60px -10px " + colorHex + "80, 0 50px 100px -20px rgba(0,0,0,0.5)" : 'none',
                   border: idx > 0 ? "1px solid rgba(255,255,255,0.05)" : 'none'
                 }}
               />
            ))}
            
            {/* Front Screen Plate */}
            <div 
              className="absolute inset-0 rounded-[3.5rem] border-[8px] overflow-hidden bg-[#0A0A10] flex flex-col pointer-events-auto shadow-inner"
              style={{ 
                transform: "translateZ(0px)",
                borderColor: frameHex,
              }}
            >
               {/* Internal Bezel + Screen Glow */}
               <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" style={{ background: "radial-gradient(circle at 50% 0%, " + colorHex + ", transparent 70%)" }} />
               <div className="absolute inset-0 ring-1 ring-white/10 rounded-[2.8rem] z-[100] pointer-events-none" />
               
               {/* Dynamic Island */}
               <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[100px] h-7 bg-black rounded-full z-50 flex items-center justify-between px-2 shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                 <div className="w-4 h-4 rounded-full bg-[#050510] border border-white/5 relative overflow-hidden flex items-center justify-center">
                   <div className="w-1.5 h-1.5 rounded-full bg-blue-900/40" />
                 </div>
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 mr-1 shadow-[0_0_8px_#10b981]" />
               </div>

               {/* Live Component UI */}
               <div className="relative z-10 w-full h-full pt-14 pb-8 px-5">
                  <FeatureScreenshot i={i} />
               </div>
               
               {/* Home Indicator */}
               <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1/3 h-1 bg-white/30 rounded-full z-50 pointer-events-none"/>
            </div>

            {/* Back Camera Bump */}
            <div 
               className="absolute top-8 left-6 w-28 h-[120px] rounded-3xl"
               style={{ 
                 transform: "translateZ(" + (-(zDepth + 3)) + "px)", 
                 backgroundColor: frameHex, 
                 border: "1px solid rgba(255,255,255,0.1)",
                 boxShadow: "inset 0 2px 4px rgba(255,255,255,0.1), 3px 5px 15px rgba(0,0,0,0.5)"
               }}
            >
               <div className="absolute top-2.5 left-2.5 w-[42px] h-[42px] rounded-full bg-black/80 border border-white/20 flex flex-col items-center justify-center shadow-inner">
                  <div className="w-5 h-5 rounded-full bg-indigo-900/30 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-black"/></div>
               </div>
               <div className="absolute bottom-2.5 left-2.5 w-[42px] h-[42px] rounded-full bg-black/80 border border-white/20 flex flex-col items-center justify-center shadow-inner">
                 <div className="w-5 h-5 rounded-full bg-indigo-900/30 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-black"/></div>
               </div>
               <div className="absolute top-1/2 -translate-y-1/2 right-2.5 w-[38px] h-[38px] rounded-full bg-black/80 border border-white/20 flex flex-col items-center justify-center shadow-inner">
                 <div className="w-4 h-4 rounded-full bg-indigo-900/30 flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-black"/></div>
               </div>
               {/* Flash */}
               <div className="absolute top-4 right-5 w-4 h-4 rounded-full bg-yellow-100/30 border border-white/10" />
               {/* Lidar */}
               <div className="absolute bottom-5 right-5 w-3 h-3 rounded-full bg-black border border-white/10" />
            </div>
            
            {/* Side Buttons */}
            <div className="absolute top-28 -left-1 w-1 h-12 bg-white/20 rounded-l-sm" style={{ transform: "translateZ(" + (-zDepth/2) + "px)" }} />
            <div className="absolute top-44 -left-1 w-1 h-16 bg-white/20 rounded-l-sm" style={{ transform: "translateZ(" + (-zDepth/2) + "px)" }} />
            <div className="absolute top-64 -left-1 w-1 h-16 bg-white/20 rounded-l-sm" style={{ transform: "translateZ(" + (-zDepth/2) + "px)" }} />
            <div className="absolute top-52 -right-1 w-1 h-20 bg-white/20 rounded-r-sm" style={{ transform: "translateZ(" + (-zDepth/2) + "px)" }} />
        </motion.div>
  )
}

const IPhone17MockupInteractive = ({ feature, i, colorHex, frameHex }: { feature: any, i: number, colorHex: string, frameHex: string }) => {
  const [isZoomed, setIsZoomed] = useState(false);

  return (
    <>
      {/* Thumbnail */}
      <div 
        className="relative w-[110px] h-[230px] cursor-pointer group [perspective:1500px]"
        onClick={() => setIsZoomed(true)}
      >
         <motion.div
           className="w-[280px] h-[580px] pointer-events-none origin-top-left"
           style={{ transformStyle: 'preserve-3d', scale: 0.35, willChange: 'transform, opacity' }}
           initial={{ rotateY: -30, rotateX: 15, opacity: 0, y: 20 }}
           whileInView={{ rotateY: -30, rotateX: 15, opacity: 1, y: 0 }}
           transition={{ duration: 0.8, ease: "easeOut" }}
           viewport={{ once: true, margin: "100px" }}
         >
            <IPhone17Model i={i} colorHex={colorHex} frameHex={frameHex} animated={true} />
         </motion.div>
      </div>

      {/* Zoom Overlay */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isZoomed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center [perspective:2000px] cursor-zoom-out p-4 md:p-10"
              onClick={() => setIsZoomed(false)}
            >
               {/* Close button */}
               <div className="absolute top-6 right-6 md:top-10 md:right-10 bg-white/10 p-3 rounded-full hover:bg-white/20 transition-colors text-white z-50 cursor-pointer flex items-center justify-center">
                 <Plus className="rotate-45" size={24} />
               </div>
               
               {/* Interactive full-size phone */}
               <motion.div
                 initial={{ scale: 0.8, opacity: 0, y: 40 }}
                 animate={{ scale: 1, opacity: 1, y: 0 }}
                 exit={{ scale: 0.8, opacity: 0, y: 40 }}
                 transition={{ type: 'spring', stiffness: 250, damping: 25 }}
                 className="cursor-default pointer-events-auto"
                 style={{ transformStyle: 'preserve-3d', width: 280, height: 580 }}
                 onClick={e => e.stopPropagation()} // Prevent close when interacting with the phone
               >
                  <IPhone17Model i={i} colorHex={colorHex} frameHex={frameHex} animated={true} />
               </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}

// ─── Extensive Features Section ────────────────────────────────────────────────────────
const ExtensiveFeatures = () => {
  const features = [
    {
      title: "Bank-Grade Document Vault",
      description: "Securely store your CIPC docs, tax clearances, and financials in one encrypted location. Never hunt for a PDF again.",
      icon: <ShieldCheck size={32} className="text-emerald-400" />,
      glow: "rgba(16, 185, 129, 0.15)",
      border: "border-emerald-500/20",
      hex: "#10b981",
      frameHex: "#064e3b"
    },
    {
      title: "Precision Grant Matching",
      description: "Our AI scans NYDA, SEFA, IDC, and private funds daily, matching them precisely against your business profile, stage, and revenue.",
      icon: <Radar size={32} className="text-blue-400" />,
      glow: "rgba(59, 130, 246, 0.15)",
      border: "border-blue-500/20",
      hex: "#3b82f6",
      frameHex: "#1e3a8a"
    },
    {
       title: "Auto-Generated Motivations",
       description: "Struggling with 'Why do you need this funding'? Our LLM generates compelling, tailored motivation letters based on your inputs.",
       icon: <FileText size={32} className="text-purple-400" />,
       glow: "rgba(168, 85, 247, 0.15)",
       border: "border-purple-500/20",
       hex: "#a855f7",
       frameHex: "#581c87"
    },
    {
       title: "One-Click Form Filling",
       description: "We map your vault data directly into standard application forms. What used to take hours now takes seconds.",
       icon: <Target size={32} className="text-pink-400" />,
       glow: "rgba(236, 72, 153, 0.15)",
       border: "border-pink-500/20",
       hex: "#ec4899",
       frameHex: "#831843"
    },
    {
      title: "24/7 AI Business Advisor",
      description: "Get instant answers to funding questions, compliance queries, and strategic advice from our expert AI chatbot.",
      icon: <MessageSquare size={32} className="text-cyan-400" />,
      glow: "rgba(34, 211, 238, 0.15)",
      border: "border-cyan-500/20",
      hex: "#22d3ee",
      frameHex: "#164e63"
    },
    {
      title: "Pitch Deck Designer",
      description: "Create stunning, professional pitch decks in minutes. Tell your story visually and convince investors.",
      icon: <Presentation size={32} className="text-indigo-400" />,
      glow: "rgba(99, 102, 241, 0.15)",
      border: "border-indigo-500/20",
      hex: "#6366f1",
      frameHex: "#312e81"
    },
    {
      title: "Instant Brand Identity",
      description: "Generate beautiful, custom logos and brand assets in seconds using our AI-powered logo designer.",
      icon: <Brush size={32} className="text-orange-400" />,
      glow: "rgba(249, 115, 22, 0.15)",
      border: "border-orange-500/20",
      hex: "#f97316",
      frameHex: "#7c2d12"
    },
    {
      title: "Automated Ad Campaigns",
      description: "Create highly converting Facebook and Google ad creatives and copy tailored to your target audience.",
      icon: <Megaphone size={32} className="text-red-400" />,
      glow: "rgba(248, 113, 113, 0.15)",
      border: "border-red-500/20",
      hex: "#f87171",
      frameHex: "#7f1d1d"
    }
  ];

  return (
    <div className="relative z-10 max-w-7xl mx-auto py-24 px-6 mt-12 mb-24">
      <div className="text-center mb-20">
        <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tight">
          Everything You Need to <br/>
          <span className="gradient-text">Secure Capital</span>
        </h2>
        <p className="text-gray-200 text-lg md:text-xl font-medium max-w-2xl mx-auto drop-shadow-md">
          We’ve built a comprehensive suite of tools designed to remove every barrier between your business and the funding it deserves.
        </p>
      </div>

      <div className="flex overflow-x-auto snap-x snap-mandatory pb-8 gap-6 md:grid md:grid-cols-2 lg:grid-cols-4 md:gap-8 md:overflow-visible hide-scrollbar">
        {features.map((feature, i) => {
          const delay = i * 0.1;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay, ease: "easeOut" }}
              className="shrink-0 w-[85vw] md:w-auto snap-center relative flex flex-col justify-between p-5 md:p-6 rounded-[1.75rem] shadow-2xl hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300 group min-h-[300px] md:min-h-[320px]"
              style={{
                backgroundColor: feature.hex, // Canva panel style
                border: '1px solid rgba(255,255,255,0.2)',
                willChange: 'transform'
              }}
            >
               {/* Ambient pattern or gradient overlay to make it look even more polished */}
               <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-black/20 pointer-events-none rounded-[1.75rem]" />
               <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] pointer-events-none mix-blend-overlay rounded-[1.75rem]" />

               <div className="relative z-10 w-full flex flex-col h-full justify-between font-sans">
                  {/* Top row with Icon and interactive Phone mockup */}
                  <div className="flex items-start justify-between relative mb-2">
                     <div 
                       className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center bg-black/10 backdrop-blur-md border border-white/30 text-white shadow-xl relative z-25"
                       style={{ boxShadow: "inset 0 0 12px " + feature.glow }}
                      >
                       {React.cloneElement(feature.icon, { size: 20 })}
                     </div>
                     
                     <div className="absolute -top-3 -right-6 z-50 group cursor-pointer" title="Click to interact with phone">
                        <div className="scale-[0.52] origin-top-right">
                           <IPhone17MockupInteractive feature={feature} i={i} colorHex={feature.hex} frameHex={feature.frameHex} />
                        </div>
                        {/* Interaction hint */}
                        <div className="absolute bottom-4 right-2 bg-white/95 text-black px-2 py-0.5 rounded-full text-[10px] font-bold shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                          Tap to interact <ArrowRight size={10} className="inline ml-1" />
                        </div>
                     </div>
                  </div>
                  
                  {/* Bottom title and description */}
                  <div className="text-left mt-auto">
                    <h3 className="text-xl md:text-2xl font-black mb-1.5 tracking-tight text-white drop-shadow-md">
                       {feature.title}
                    </h3>
                    <p className="text-xs md:text-sm text-white/90 leading-relaxed font-semibold drop-shadow-sm">
                       {feature.description}
                    </p>
                  </div>
               </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Main Landing ──────────────────────────────────────────────────────────────
const Landing: React.FC<LandingProps> = ({ onGetStarted, onLogin, onSearchFunding }) => {
  return (
    <div className="min-h-screen relative overflow-hidden text-white">
      <CleanBackground />

      {/* ── Live Activity Notification ── */}
      <div className="fixed bottom-8 right-8 z-50 hidden lg:block">
        <motion.div
          initial={{ x: 120, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 2.5, duration: 0.7, ease: 'easeOut' }}
          className="glass-panel p-4 rounded-2xl flex items-center gap-4 fintech-glow max-w-xs"
        >
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Banknote size={20} />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Live Activity</p>
            <p className="text-xs font-bold leading-tight">
              R50,000 funded to <span className="text-purple-400">AgroTech Solutions</span>
            </p>
          </div>
          {/* pulse dot */}
          <span className="relative flex shrink-0">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        </motion.div>
      </div>

      {/* ── Nav ── */}
      <nav className="relative z-10 px-6 py-6 flex justify-between items-center max-w-7xl mx-auto">
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3"
        >
          <StacFundLogo size={56} />
          <div>
            <h1 className="text-xl font-black tracking-tighter leading-none">StacFund</h1>
            <p className="text-[9px] text-purple-400/80 uppercase tracking-[0.22em] font-bold mt-0.5">
              Power Your Business
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3"
        >
          <button
            onClick={onLogin}
            className="text-gray-400 hover:text-white font-bold transition-colors px-4 text-sm"
          >
            Log In
          </button>
          <button
            onClick={onGetStarted}
            className="relative bg-white/5 hover:bg-purple-500/20 px-5 py-2.5 rounded-full border border-white/10 hover:border-purple-500/40 font-bold transition-all text-sm group overflow-hidden"
          >
            <span className="relative z-10">Get Started</span>
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-indigo-600/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
            />
          </button>
        </motion.div>
      </nav>

      {/* ── Hero ── */}
      <main className="relative z-10 max-w-5xl mx-auto pt-16 pb-28 px-6 text-center">

        {/* Orbital ring decoration (desktop) */}
        <div className="relative">

          {/* Badge */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/25 px-4 py-2 rounded-full text-purple-300 text-xs font-bold mb-8"
          >
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block"
            />
            <Search size={12} />
            The Ultimate Preparation System
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-6xl md:text-8xl font-black mb-6 tracking-tight leading-[0.92]"
          >
            Never Miss {' '}
            <span className="gradient-text">Funding Again</span>
          </motion.h1>

          {/* Sub-headline */}
          <motion.p
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-gray-200 text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed mb-14 drop-shadow-md"
          >
            Get your business ready before the window opens. We track NYDA, SEFA, and CDSP grants so you can prepare your documents and apply stress-free. <br />
            <span className="text-purple-300 font-bold">Stumbling onto funding is a distribution failure—we fix that.</span>
          </motion.p>
        </div>

        {/* Stats grid */}
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16"
        >
          {[
            { label: 'Funding Options', val: '120+', icon: <Zap size={18} className="text-indigo-400" />, glow: '#6366f1' },
            { label: 'Available Grants', val: 'R500M+', icon: <Banknote size={18} className="text-emerald-400" />, glow: '#10b981' },
            { label: 'SA Entrepreneurs', val: '15,000+', icon: <Users size={18} className="text-purple-400" />, glow: '#a855f7' },
            { label: 'Application Time', val: '15 mins', icon: <Clock size={18} className="text-blue-400" />, glow: '#3b82f6' },
          ].map((stat, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -6, scale: 1.03 }}
              transition={{ type: 'spring', stiffness: 300 }}
              className="glass-panel p-6 rounded-3xl relative overflow-hidden group cursor-default"
              style={{ boxShadow: "0 0 0 0 " + stat.glow + "00" }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 30px " + stat.glow + "25, inset 0 0 30px " + stat.glow + "08";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = '';
              }}
            >
              {/* Top accent line */}
              <div
                className="absolute top-0 left-0 right-0 h-[1px] opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "linear-gradient(90deg, transparent, " + stat.glow + ", transparent)" }}
              />
              <div className="flex justify-center mb-3">{stat.icon}</div>
              <h4 className="text-2xl md:text-3xl font-black mb-1 tracking-tight">{stat.val}</h4>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* ── How It Works (The Anti-Hustle Workflow) ── */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.8 }}
          className="my-32 relative"
        >
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">
              3 Steps. <span className="gradient-text">0 Friction.</span>
            </h2>
            <p className="text-gray-200 text-lg font-medium max-w-2xl mx-auto leading-relaxed drop-shadow-md">
              Built for the last-minute legends and busy solopreneurs. <br className="hidden md:block"/>
              We destroyed the paperwork, the stress, and the endless searching.
            </p>
          </div>

          <div className="flex overflow-x-auto snap-x snap-mandatory pb-8 gap-6 md:grid md:grid-cols-3 md:overflow-visible hide-scrollbar relative">
            {/* Connecting lines for desktop */}
            <div className="hidden md:block absolute top-[60px] left-[20%] right-[20%] h-[2px] bg-gradient-to-r from-purple-500/0 via-purple-500/20 to-purple-500/0 pointer-events-none" />
            
            {[
              {
                step: '01',
                title: "Dump Your Docs. We'll Sort 'Em.",
                desc: "No certifying. No organizing. Just upload your ID, bank statements, and pitch once. Our AI digitizes and categorizes everything instantly.",
                icon: <FolderUp size={28} className="text-purple-400" />,
                glow: '#a855f7'
              },
              {
                step: '02',
                title: "The AI Hunts For You.",
                desc: "Stop doom-scrolling government portals. Our engine matches your exact business profile to NYDA, SEFA, and private grants you actually qualify for.",
                icon: <Radar size={28} className="text-indigo-400" />,
                glow: '#6366f1'
              },
              {
                step: '03',
                title: "1-Click Apply.",
                desc: "Say goodbye to writer's block with auto-generated motivation letters. The AI auto-fills applications and fires them off while you run your business.",
                icon: <Rocket size={28} className="text-blue-400" />,
                glow: '#3b82f6'
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -8, scale: 1.02 }}
                transition={{ type: 'spring', stiffness: 300 }}
                className="shrink-0 w-[85vw] md:w-auto snap-center relative glass-panel rounded-3xl p-8 text-left group overflow-hidden border border-white/5 bg-white/[0.02]"
              >
                {/* Background oversized step number */}
                <div className="absolute -top-4 -right-4 text-8xl font-black text-white/[0.02] pointer-events-none group-hover:text-white/[0.04] transition-colors duration-500">
                  {feature.step}
                </div>
                
                {/* Icon Container */}
                <div 
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8 relative z-10 transition-transform duration-500 group-hover:scale-110"
                  style={{ background: "linear-gradient(135deg, " + feature.glow + "20, transparent)", border: "1px solid " + feature.glow + "40" }}
                >
                  {feature.icon}
                </div>
                
                <h3 className="text-2xl font-bold mb-4 tracking-tight relative z-10">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed text-sm relative z-10">
                  {feature.desc}
                </p>
                
                {/* Glow effect on hover */}
                <div 
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none -z-10"
                  style={{ background: "radial-gradient(circle at 50% 100%, " + feature.glow + "15, transparent 70%)" }}
                />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── Extensive Features ── */}
        <ExtensiveFeatures />

        {/* CTA Buttons */}
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-2xl mx-auto mb-14"
        >
          <button
            onClick={onGetStarted}
            className="w-full sm:w-auto relative bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-5 px-10 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-2xl shadow-purple-500/30 text-base group overflow-hidden"
          >
            {/* Shimmer sweep */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              initial={{ x: '-100%' }}
              animate={{ x: '200%' }}
              transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
            />
            <span className="relative">Start Your Application Now</span>
            <ArrowRight size={20} className="relative group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            onClick={onSearchFunding}
            className="w-full sm:w-auto bg-white/5 hover:bg-purple-500/10 text-white font-black py-5 px-10 rounded-2xl flex items-center justify-center gap-3 transition-all border border-white/10 hover:border-purple-500/30 text-base group"
          >
            <Search size={20} className="text-purple-400 group-hover:scale-110 transition-transform" />
            Search for Funding
          </button>
        </motion.div>

        {/* Tracked Logos Marquee */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 1 }}
          className="w-full overflow-hidden mt-16 mb-8 relative border-y border-white/5 py-8"
        >
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#0a0a1a] to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#0a0a1a] to-transparent z-10" />
          
          <p className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em] mb-6">Tracking Real-Time Opportunities From</p>
          
          <div className="flex gap-12 items-center w-max animate-[scroll_40s_linear_infinite]">
            {[
               { name: 'NYDA', url: '/assets/logos/hero/nyda.svg' },
               { name: 'IDC', url: '/assets/logos/hero/idc.svg' },
               { name: 'SEFA', url: '/assets/logos/hero/sefa.svg' },
               { name: 'NEF', url: '/assets/logos/hero/nef.svg' },
               { name: 'the dtic', url: '/assets/logos/hero/dtic.svg' },
               { name: 'Seda', url: '/assets/logos/hero/seda.svg' },
               { name: 'ECDC', url: '/assets/logos/hero/ecdc.png' },
               { name: 'TIA', url: '/assets/logos/hero/tia.svg' },
               { name: 'GEP', url: '/assets/logos/hero/gep.svg' },
               { name: 'FNB', url: '/assets/logos/hero/fnb.png' },
               // Duplicated for seamless scrolling
               { name: 'NYDA', url: '/assets/logos/hero/nyda.svg' },
               { name: 'IDC', url: '/assets/logos/hero/idc.svg' },
               { name: 'SEFA', url: '/assets/logos/hero/sefa.svg' },
               { name: 'NEF', url: '/assets/logos/hero/nef.svg' },
               { name: 'the dtic', url: '/assets/logos/hero/dtic.svg' },
               { name: 'Seda', url: '/assets/logos/hero/seda.svg' },
               { name: 'ECDC', url: '/assets/logos/hero/ecdc.png' },
               { name: 'TIA', url: '/assets/logos/hero/tia.svg' },
               { name: 'GEP', url: '/assets/logos/hero/gep.svg' },
               { name: 'FNB', url: '/assets/logos/hero/fnb.png' }
            ].map((img, i) => (
              <div key={i} className="flex flex-col items-center gap-2 opacity-50 hover:opacity-100 transition-opacity grayscale hover:grayscale-0">
                <div className="h-10 w-24 flex items-center justify-center">
                  <img src={img.url} alt={img.name} className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                </div>
              </div>
            ))}
          </div>
          
          <style>{`
            @keyframes scroll {
              0% { transform: translateX(0); }
              100% { transform: translateX(calc(-50% - 1.5rem)); }
            }
          `}</style>
        </motion.div>

        {/* Search bar */}
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="max-w-2xl mx-auto relative group"
        >
          {/* Glow ring behind input */}
          <div className="absolute -inset-[1px] rounded-full bg-gradient-to-r from-purple-600/30 via-indigo-600/30 to-purple-600/30 opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
          <div className="relative">
            <input
              type="text"
              placeholder="Search funding opportunities..."
              className="w-full bg-white/5 border border-white/10 rounded-full py-5 px-10 text-base focus:outline-none focus:border-purple-500/50 transition-all placeholder:text-gray-600"
              onKeyDown={(e) => { if (e.key === 'Enter') onSearchFunding(); }}
            />
            <button
              onClick={onSearchFunding}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white p-3 rounded-full transition-all shadow-lg shadow-purple-500/30"
            >
              <ArrowRight size={22} />
            </button>
          </div>
        </motion.div>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 py-8 border-t border-white/5 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <StacFundLogo size={24} />
          <span className="text-gray-500 font-black tracking-tight">StacFund</span>
        </div>
        <p className="text-gray-400 text-sm font-medium tracking-wider">
          © 2026 StacFund. Level up your business.
        </p>
      </footer>
    </div>
  );
};

export default Landing;
