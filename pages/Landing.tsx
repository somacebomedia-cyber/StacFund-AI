import React, { useMemo } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, Search, Banknote, Users, Clock, Zap, FolderUp, Radar, Rocket } from 'lucide-react';

interface LandingProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onSearchFunding: () => void;
}

// ─── Custom Orbital Logo ──────────────────────────────────────────────────────
const StacFundLogo = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <defs>
      <linearGradient id="orbitGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#a855f7" />
        <stop offset="100%" stopColor="#6366f1" />
      </linearGradient>
      <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#c084fc" stopOpacity="0.9" />
        <stop offset="50%" stopColor="#818cf8" stopOpacity="0.4" />
        <stop offset="100%" stopColor="#c084fc" stopOpacity="0.9" />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    {/* Outer orbit ring */}
    <ellipse cx="20" cy="20" rx="18" ry="7" stroke="url(#ringGrad)" strokeWidth="1.2" fill="none" transform="rotate(-30 20 20)" filter="url(#glow)" />
    {/* Inner orbit ring */}
    <ellipse cx="20" cy="20" rx="13" ry="5" stroke="url(#ringGrad)" strokeWidth="0.8" fill="none" strokeOpacity="0.5" transform="rotate(60 20 20)" />
    {/* Core planet */}
    <circle cx="20" cy="20" r="5" fill="url(#orbitGrad)" filter="url(#glow)" />
    <circle cx="20" cy="20" r="5" fill="url(#orbitGrad)" />
    <circle cx="18.5" cy="18.5" r="1.5" fill="white" fillOpacity="0.3" />
    {/* Orbit dot */}
    <circle cx="36" cy="17" r="2" fill="#c084fc" filter="url(#glow)" />
  </svg>
);

// ─── Background: Full Cosmic Scene ────────────────────────────────────────────
const BackgroundAnimation = () => {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 1000], [0, 200]);
  const y2 = useTransform(scrollY, [0, 1000], [0, -200]);
  const rotate = useTransform(scrollY, [0, 1000], [0, 45]);

  // Star field — 90 stars of varying brightness
  const stars = useMemo(() => Array.from({ length: 90 }).map((_, i) => ({
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: Math.random() < 0.15 ? 2 : Math.random() < 0.4 ? 1.5 : 1,
    opacity: 0.15 + Math.random() * 0.7,
    delay: Math.random() * 8,
    duration: 3 + Math.random() * 5,
    color: Math.random() < 0.2 ? '#c4b5fd' : Math.random() < 0.1 ? '#93c5fd' : '#ffffff',
  })), []);

  // Constellation nodes — larger, connected
  const nodes = useMemo(() => Array.from({ length: 20 }).map((_, i) => ({
    left: `${10 + Math.random() * 80}%`,
    top: `${5 + Math.random() * 90}%`,
    delay: Math.random() * 5,
    duration: 3 + Math.random() * 4,
    size: 2 + Math.random() * 3,
    color: i % 3 === 0 ? '#a855f7' : i % 3 === 1 ? '#6366f1' : '#ec4899',
  })), []);

  // Shooting stars — 4 of them
  const shootingStars = useMemo(() => Array.from({ length: 4 }).map((_, i) => ({
    top: `${10 + i * 18}%`,
    delay: 3 + i * 7,
    duration: 1.2 + Math.random() * 0.8,
  })), []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* ── Deep space base ── */}
      <div className="absolute inset-0 bg-[#050510]" />

      {/* ── Star field ── */}
      {stars.map((star, i) => (
        <motion.div
          key={`star-${i}`}
          animate={{ opacity: [star.opacity * 0.4, star.opacity, star.opacity * 0.4] }}
          transition={{ duration: star.duration, repeat: Infinity, delay: star.delay, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            borderRadius: '50%',
            backgroundColor: star.color,
            boxShadow: star.size >= 1.5 ? `0 0 ${star.size * 3}px ${star.color}` : 'none',
          }}
        />
      ))}

      {/* ── Shooting stars ── */}
      {shootingStars.map((s, i) => (
        <motion.div
          key={`shoot-${i}`}
          initial={{ left: '-5%', top: s.top, opacity: 0 }}
          animate={{ left: '105%', opacity: [0, 1, 1, 0] }}
          transition={{
            duration: s.duration,
            repeat: Infinity,
            delay: s.delay,
            ease: 'easeIn',
            repeatDelay: 12 + i * 5,
          }}
          style={{
            position: 'absolute',
            width: '120px',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(196,181,253,0.9), rgba(255,255,255,1))',
            borderRadius: '2px',
            filter: 'blur(0.5px)',
          }}
        />
      ))}

      {/* ── Nebula orbs ── */}
      {/* Purple — top left */}
      <motion.div
        animate={{ scale: [1, 1.15, 1], x: [0, 40, 0], y: [0, 25, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-[-15%] left-[-10%] w-[65%] h-[65%] rounded-full blur-[130px]"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, rgba(99,102,241,0.08) 50%, transparent 70%)' }}
      />
      {/* Blue — bottom right */}
      <motion.div
        animate={{ scale: [1, 1.25, 1], x: [0, -35, 0], y: [0, -50, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-[-15%] right-[-10%] w-[65%] h-[65%] rounded-full blur-[130px]"
        style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.14) 0%, rgba(99,102,241,0.07) 50%, transparent 70%)' }}
      />
      {/* Magenta — center, depth layer */}
      <motion.div
        animate={{ scale: [1, 1.1, 1], x: [0, 20, 0], y: [0, -30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        className="absolute top-[20%] left-[30%] w-[45%] h-[45%] rounded-full blur-[150px]"
        style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.07) 0%, rgba(168,85,247,0.04) 50%, transparent 70%)' }}
      />

      {/* ── Dot grid with scroll parallax ── */}
      <motion.div
        style={{ y: y1, rotate }}
        className="absolute inset-0 opacity-[0.12]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.12 }}
        transition={{ duration: 2.5 }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, rgba(167,139,250,0.5) 1px, transparent 0)`,
            backgroundSize: '44px 44px',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050510] via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050510] via-transparent to-transparent opacity-70" />
      </motion.div>

      {/* ── Data pulse lines ── */}
      <div className="absolute inset-0 opacity-[0.06]">
        {[...Array(7)].map((_, i) => (
          <motion.div
            key={`pulse-${i}`}
            initial={{ left: '-10%', top: `${15 + i * 12}%`, opacity: 0 }}
            animate={{ left: '110%', opacity: [0, 1, 1, 0] }}
            transition={{ duration: 9 + i * 2, repeat: Infinity, delay: i * 1.8, ease: 'linear' }}
            className="absolute h-[1px] w-48"
            style={{ background: `linear-gradient(90deg, transparent, ${i % 2 === 0 ? '#a855f7' : '#818cf8'}, transparent)`, filter: 'blur(1px)' }}
          />
        ))}
      </div>

      {/* ── Constellation nodes ── */}
      {nodes.map((node, i) => (
        <motion.div
          key={`node-${i}`}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0.1, 0.5, 0.1], scale: [1, 1.6, 1], y: [0, -16, 0] }}
          transition={{ duration: node.duration, repeat: Infinity, delay: node.delay, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            left: node.left,
            top: node.top,
            width: node.size,
            height: node.size,
            borderRadius: '50%',
            backgroundColor: node.color,
            boxShadow: `0 0 8px ${node.color}, 0 0 16px ${node.color}40`,
          }}
        />
      ))}

      {/* ── Vignette for depth ── */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(5,5,16,0.7) 100%)',
        }}
      />
    </div>
  );
};

// ─── Decorative 3D Orbit Ring (hero accent) ────────────────────────────────────
const OrbitalRing = () => (
  <motion.div
    className="absolute right-[-60px] top-[-40px] opacity-20 pointer-events-none hidden lg:block"
    animate={{ rotate: 360 }}
    transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
  >
    <svg width="420" height="420" viewBox="0 0 420 420" fill="none">
      <defs>
        <linearGradient id="ring1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#6366f1" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="ring2" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ec4899" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#a855f7" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#ec4899" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <ellipse cx="210" cy="210" rx="200" ry="75" stroke="url(#ring1)" strokeWidth="1.5" fill="none" transform="rotate(-20 210 210)" />
      <ellipse cx="210" cy="210" rx="160" ry="60" stroke="url(#ring2)" strokeWidth="1" fill="none" transform="rotate(40 210 210)" />
      <ellipse cx="210" cy="210" rx="120" ry="40" stroke="url(#ring1)" strokeWidth="0.8" fill="none" strokeOpacity="0.4" />
      {/* Orbiting dot */}
      <circle cx="408" cy="196" r="4" fill="#c084fc" />
      <circle cx="408" cy="196" r="8" fill="#c084fc" fillOpacity="0.2" />
    </svg>
  </motion.div>
);

// ─── Main Landing ──────────────────────────────────────────────────────────────
const Landing: React.FC<LandingProps> = ({ onGetStarted, onLogin, onSearchFunding }) => {
  return (
    <div className="min-h-screen relative overflow-hidden bg-[#050510] text-white">
      <BackgroundAnimation />

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
          <StacFundLogo size={42} />
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
          <OrbitalRing />

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
            Find Funding for Your Side Hustle or Business
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-6xl md:text-8xl font-black mb-6 tracking-tight leading-[0.92]"
          >
            Funding{' '}
            <span className="gradient-text">Made Easy</span>
          </motion.h1>

          {/* Sub-headline */}
          <motion.p
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-14"
          >
            Get your NYDA, SEFA, or provincial grant application ready in minutes.
            Auto-fill forms, upload your ID and documents, and track your applications —{' '}
            <span className="text-purple-300 font-semibold">all in one place.</span>
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
