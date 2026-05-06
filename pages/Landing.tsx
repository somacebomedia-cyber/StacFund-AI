import React, { useMemo } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, Search, Banknote, Users, Clock, Zap, FolderUp, Radar, Rocket, ShieldCheck, FileText, Target, MessageSquare, Presentation, Brush, Megaphone } from 'lucide-react';

interface LandingProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onSearchFunding: () => void;
}

// ─── Custom Logo ──────────────────────────────────────────────────────
const StacFundLogo = ({ size = 40 }: { size?: number }) => (
  <img 
    src="https://plain-apac-prod-public.komododecks.com/202605/01/E345pPd1uITno0rNTXrP/image.png" 
    alt="StacFund Logo" 
    style={{ width: size, height: size, objectFit: 'contain' }}
  />
);

// ─── Background ───────────────────────────────────────────────────────────────
const CleanBackground = () => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <div 
        className="absolute inset-0 bg-center bg-cover bg-no-repeat"
        style={{ backgroundImage: "url('https://plain-apac-prod-public.komododecks.com/202605/06/BqmNPYSSoslO0BZswqUD/image.jpg')" }}
      />
    </div>
  );
};

// ─── Extensive Features Section ────────────────────────────────────────────────────────
const ExtensiveFeatures = () => {
  const features = [
    {
      title: "Bank-Grade Document Vault",
      description: "Securely store your CIPC docs, tax clearances, and financials in one encrypted location. Never hunt for a PDF again.",
      icon: <ShieldCheck size={32} className="text-emerald-400" />,
      glow: "rgba(16, 185, 129, 0.15)",
      border: "border-emerald-500/20"
    },
    {
      title: "Precision Grant Matching",
      description: "Our AI scans NYDA, SEFA, IDC, and private funds daily, matching them precisely against your business profile, stage, and revenue.",
      icon: <Radar size={32} className="text-blue-400" />,
      glow: "rgba(59, 130, 246, 0.15)",
      border: "border-blue-500/20"
    },
    {
       title: "Auto-Generated Motivations",
       description: "Struggling with 'Why do you need this funding'? Our LLM generates compelling, tailored motivation letters based on your inputs.",
       icon: <FileText size={32} className="text-purple-400" />,
       glow: "rgba(168, 85, 247, 0.15)",
       border: "border-purple-500/20"
    },
    {
       title: "One-Click Form Filling",
       description: "We map your vault data directly into standard application forms. What used to take hours now takes seconds.",
       icon: <Target size={32} className="text-pink-400" />,
       glow: "rgba(236, 72, 153, 0.15)",
       border: "border-pink-500/20"
    },
    {
      title: "24/7 AI Business Advisor",
      description: "Get instant answers to funding questions, compliance queries, and strategic advice from our expert AI chatbot.",
      icon: <MessageSquare size={32} className="text-cyan-400" />,
      glow: "rgba(34, 211, 238, 0.15)",
      border: "border-cyan-500/20"
    },
    {
      title: "Pitch Deck Designer",
      description: "Create stunning, professional pitch decks in minutes. Tell your story visually and convince investors.",
      icon: <Presentation size={32} className="text-indigo-400" />,
      glow: "rgba(99, 102, 241, 0.15)",
      border: "border-indigo-500/20"
    },
    {
      title: "Instant Brand Identity",
      description: "Generate beautiful, custom logos and brand assets in seconds using our AI-powered logo designer.",
      icon: <Brush size={32} className="text-orange-400" />,
      glow: "rgba(249, 115, 22, 0.15)",
      border: "border-orange-500/20"
    },
    {
      title: "Automated Ad Campaigns",
      description: "Create highly converting Facebook and Google ad creatives and copy tailored to your target audience.",
      icon: <Megaphone size={32} className="text-red-400" />,
      glow: "rgba(248, 113, 113, 0.15)",
      border: "border-red-500/20"
    }
  ];

  return (
    <div className="relative z-10 max-w-5xl mx-auto py-24 px-6 mt-12 mb-24">
      <div className="text-center mb-24">
        <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tight">
          Everything You Need to <br/>
          <span className="gradient-text">Secure Capital</span>
        </h2>
        <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto">
          We’ve built a comprehensive suite of tools designed to remove every barrier between your business and the funding it deserves.
        </p>
      </div>

      <div className="relative pb-16">
        {features.map((feature, i) => {
          const topOffset = 100 + i * 24; // Stacking offset
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 80 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="sticky flex flex-col md:flex-row items-center gap-8 md:gap-16 glass-panel rounded-[2.5rem] p-8 md:p-14 mb-[8vh] md:mb-[12vh]"
              style={{
                top: `${topOffset}px`,
                boxShadow: `0 -20px 60px -20px ${feature.glow}, inset 0 1px 0 rgba(255,255,255,0.1)`,
                backgroundColor: '#0a0816', // Dark background so it hides cards scrolling behind it
                zIndex: i,
                border: '1px solid rgba(255,255,255,0.05)'
              }}
            >
              <div className="flex-1">
                <div 
                  className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-8 bg-gradient-to-br from-white/5 to-white/0 border ${feature.border}`}
                  style={{ boxShadow: `inset 0 0 20px ${feature.glow}` }}
                >
                  {feature.icon}
                </div>
                <h3 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">{feature.title}</h3>
                <p className="text-gray-400 text-lg leading-relaxed">
                  {feature.description}
                </p>
              </div>
              <div className="flex-1 w-full bg-[#05040d] rounded-2xl h-64 md:h-80 border border-white/5 relative overflow-hidden flex items-center justify-center p-6">
                 {/* Visual Background */}
                 <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at center, ${feature.glow}, transparent 70%)` }} />
                 
                 {/* Abstract UI representation */}
                 <div className="relative z-10 w-full h-full border border-white/10 rounded-xl bg-[#0a0816]/80 backdrop-blur-md flex flex-col group overflow-hidden shadow-2xl">
                   {/* Fake UI Header */}
                   <div className="h-10 border-b border-white/10 flex items-center px-4 gap-2 bg-white/5">
                     <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                     <div className="w-3 h-3 rounded-full bg-amber-500/50"></div>
                     <div className="w-3 h-3 rounded-full bg-emerald-500/50"></div>
                   </div>
                   {/* Fake Content area */}
                   <div className="flex-1 p-6 flex flex-col gap-4 relative">
                      <motion.div 
                        initial={{ opacity: 0, width: "0%" }}
                        whileInView={{ opacity: 1, width: "70%" }}
                        transition={{ delay: 0.3 + (i * 0.1), duration: 0.8 }}
                        className="h-4 rounded bg-white/10"
                      />
                      <motion.div 
                        initial={{ opacity: 0, width: "0%" }}
                        whileInView={{ opacity: 1, width: "40%" }}
                        transition={{ delay: 0.4 + (i * 0.1), duration: 0.8 }}
                        className="h-4 rounded bg-white/5"
                      />
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 + (i * 0.1), duration: 0.5 }}
                        className="w-full h-24 rounded-lg mt-auto bg-gradient-to-r from-white/5 to-white/0 border border-white/5 flex items-center px-4" 
                      >
                         <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex shrink-0" />
                         <div className="ml-4 flex flex-col gap-2 w-full">
                           <div className="h-2 w-1/2 rounded bg-white/10" />
                           <div className="h-2 w-1/3 rounded bg-white/5" />
                         </div>
                      </motion.div>
                   </div>
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
            className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-14"
          >
            Get your business ready before the window opens. We track NYDA, SEFA, and CDSP grants so you can prepare your documents and apply stress-free. <br />
            <span className="text-purple-300 font-semibold">Stumbling onto funding is a distribution failure—we fix that.</span>
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
              style={{ boxShadow: `0 0 0 0 ${stat.glow}00` }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 30px ${stat.glow}25, inset 0 0 30px ${stat.glow}08`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = '';
              }}
            >
              {/* Top accent line */}
              <div
                className="absolute top-0 left-0 right-0 h-[1px] opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(90deg, transparent, ${stat.glow}, transparent)` }}
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
            <p className="text-gray-400 text-lg max-w-2xl mx-auto leading-relaxed">
              Built for the last-minute legends and busy solopreneurs. <br className="hidden md:block"/>
              We destroyed the paperwork, the stress, and the endless searching.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 relative">
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
                className="relative glass-panel rounded-3xl p-8 text-left group overflow-hidden border border-white/5 bg-white/[0.02]"
              >
                {/* Background oversized step number */}
                <div className="absolute -top-4 -right-4 text-8xl font-black text-white/[0.02] pointer-events-none group-hover:text-white/[0.04] transition-colors duration-500">
                  {feature.step}
                </div>
                
                {/* Icon Container */}
                <div 
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8 relative z-10 transition-transform duration-500 group-hover:scale-110"
                  style={{ background: `linear-gradient(135deg, ${feature.glow}20, transparent)`, border: `1px solid ${feature.glow}40` }}
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
                  style={{ background: `radial-gradient(circle at 50% 100%, ${feature.glow}15, transparent 70%)` }}
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
        <p className="text-gray-600 text-xs tracking-wider">
          © 2025 StacFund · Empowering businesses worldwide.
        </p>
      </footer>
    </div>
  );
};

export default Landing;
