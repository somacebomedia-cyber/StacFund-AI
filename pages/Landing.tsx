
import React, { useMemo } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, Search, Target, Banknote, Users, Clock } from 'lucide-react';

interface LandingProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onSearchFunding: () => void;
}

const BackgroundAnimation = () => {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 1000], [0, 200]);
  const y2 = useTransform(scrollY, [0, 1000], [0, -200]);
  const rotate = useTransform(scrollY, [0, 1000], [0, 45]);
  
  const nodes = useMemo(() => {
    return Array.from({ length: 20 }).map((_, i) => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      delay: Math.random() * 5,
      duration: 3 + Math.random() * 4,
      size: 2 + Math.random() * 4
    }));
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Deep Background Gradient */}
      <div className="absolute inset-0 bg-[#050510]" />
      
      {/* Moving Ambient Orbs */}
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          x: [0, 50, 0],
          y: [0, 30, 0]
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-purple-600/10 rounded-full blur-[120px]" 
      />
      
      <motion.div 
        animate={{ 
          scale: [1, 1.3, 1],
          x: [0, -40, 0],
          y: [0, -60, 0]
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[120px]" 
      />

      {/* Geometric Grid */}
      <motion.div 
        style={{ y: y1, rotate }}
        className="absolute inset-0 opacity-[0.15]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.15 }}
        transition={{ duration: 2 }}
      >
        <div className="absolute inset-0" 
             style={{ 
               backgroundImage: `radial-gradient(circle at 2px 2px, rgba(139, 92, 246, 0.4) 1px, transparent 0)`,
               backgroundSize: '40px 40px' 
             }} 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050510] via-transparent to-transparent" />
      </motion.div>

      {/* Data Pulse Lines */}
      <div className="absolute inset-0 opacity-[0.05]">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ left: '-10%', top: `${20 + i * 15}%`, opacity: 0 }}
            animate={{ 
              left: '110%', 
              opacity: [0, 1, 0] 
            }}
            transition={{
              duration: 8 + i * 2,
              repeat: Infinity,
              delay: i * 1.5,
              ease: "linear"
            }}
            className="absolute h-[1px] w-40 bg-gradient-to-r from-transparent via-purple-400 to-transparent blur-[1px]"
          />
        ))}
      </div>

      {/* Floating Data Nodes */}
      {nodes.map((node, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ 
            opacity: [0.1, 0.4, 0.1],
            scale: [1, 1.5, 1],
            y: [0, -20, 0]
          }}
          transition={{
            duration: node.duration,
            repeat: Infinity,
            delay: node.delay,
            ease: "easeInOut"
          }}
          style={{
            position: 'absolute',
            left: node.left,
            top: node.top,
            width: node.size,
            height: node.size,
            backgroundColor: i % 2 === 0 ? '#8b5cf6' : '#3b82f6',
            borderRadius: '50%',
            boxShadow: `0 0 10px ${i % 2 === 0 ? '#8b5cf6' : '#3b82f6'}`
          }}
        />
      ))}
    </div>
  );
};

const Landing: React.FC<LandingProps> = ({ onGetStarted, onLogin, onSearchFunding }) => {
  return (
    <div className="min-h-screen relative overflow-hidden bg-[#050510] text-white">
      <BackgroundAnimation />

      {/* Live Activity Indicator */}
      <div className="fixed bottom-10 right-10 z-50 hidden lg:block">
        <motion.div 
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 2, duration: 0.8 }}
          className="glass-panel p-4 rounded-2xl flex items-center gap-4 fintech-glow max-w-xs"
        >
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Banknote size={20} />
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Live Activity</p>
            <p className="text-xs font-bold leading-tight">R50,000 funded to <span className="text-purple-400">AgroTech Solutions</span></p>
          </div>
        </motion.div>
      </div>

      <nav className="relative z-10 px-6 py-8 flex justify-between items-center max-w-7xl mx-auto">
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Target className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter">StacFund</h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-[0.2em] -mt-1 font-bold">Power Your Business</p>
          </div>
        </motion.div>
        
        <motion.div 
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-4"
        >
          <button 
            onClick={onLogin}
            className="text-gray-400 hover:text-white font-bold transition-all px-4"
          >
            Log In
          </button>
          <button 
            onClick={onGetStarted}
            className="bg-white/5 hover:bg-white/10 px-6 py-3 rounded-full border border-white/10 font-bold transition-all"
          >
            Get Started
          </button>
        </motion.div>
      </nav>

      <main className="relative z-10 max-w-5xl mx-auto pt-20 pb-32 px-6 text-center">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 px-4 py-2 rounded-full text-purple-400 text-xs font-bold mb-8"
        >
           <Search size={14} className="animate-pulse" /> Find Funding for Your Side Hustle or Business
        </motion.div>
        
        <motion.h1 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-6xl md:text-8xl font-black mb-6 tracking-tight leading-[0.9]"
        >
          Funding <span className="gradient-text">Made Easy</span>
        </motion.h1>
        
        <motion.p 
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-gray-400 text-xl max-w-3xl mx-auto leading-relaxed mb-12"
        >
          Get your NYDA, SEFA, or provincial grant application ready in minutes. 
          Auto-fill forms, upload your ID and documents, and track your applications - all in one place.
        </motion.p>

        <motion.div 
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-20"
        >
          {[
            { label: 'Funding Options', val: '120+', icon: <Target className="text-indigo-400" /> },
            { label: 'Available Grants', val: 'R500M+', icon: <Banknote className="text-emerald-400" /> },
            { label: 'SA Entrepreneurs', val: '15,000+', icon: <Users className="text-purple-400" /> },
            { label: 'Application Time', val: '15 mins', icon: <Clock className="text-blue-400" /> }
          ].map((stat, i) => (
            <motion.div 
              key={i} 
              whileHover={{ y: -5, scale: 1.02 }}
              className="glass-panel p-8 rounded-3xl"
            >
              <div className="flex justify-center mb-4">{stat.icon}</div>
              <h4 className="text-3xl font-black mb-1">{stat.val}</h4>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div 
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-2xl mx-auto mb-16"
        >
          <button 
            onClick={onGetStarted}
            className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-5 px-10 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-2xl shadow-purple-500/30 text-lg group"
          >
            Start Your Application Now <ArrowRight size={22} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <button 
            onClick={onSearchFunding}
            className="w-full sm:w-auto bg-white/5 hover:bg-white/10 text-white font-black py-5 px-10 rounded-2xl flex items-center justify-center gap-3 transition-all border border-white/10 text-lg group"
          >
            <Search size={22} className="text-purple-400 group-hover:scale-110 transition-transform" /> Search for Funding
          </button>
        </motion.div>

        <motion.div 
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="max-w-2xl mx-auto relative group"
        >
          <input 
            type="text" 
            placeholder="Search funding opportunities..." 
            className="w-full bg-white/5 border border-white/10 rounded-full py-6 px-10 text-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-gray-600"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSearchFunding();
              }
            }}
          />
          <button 
            onClick={onSearchFunding}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-purple-600 hover:bg-purple-500 text-white p-3 rounded-full transition-all group-focus-within:scale-110"
          >
            <ArrowRight size={24} />
          </button>
        </motion.div>
      </main>

      <footer className="relative z-10 py-10 border-t border-white/5 text-center text-gray-500 text-sm">
        © 2025 StacFund. Empowering businesses worldwide.
      </footer>
    </div>
  );
};

export default Landing;

