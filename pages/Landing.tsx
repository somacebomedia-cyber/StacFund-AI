
import React from 'react';
import { ArrowRight, Search, Target, Banknote, Users, Clock } from 'lucide-react';

interface LandingProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onSearchFunding: () => void;
}

const Landing: React.FC<LandingProps> = ({ onGetStarted, onLogin, onSearchFunding }) => {
  return (
    <div className="min-h-screen relative overflow-hidden bg-[#050510]">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]"></div>

      <nav className="relative z-10 px-6 py-8 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Target className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter">StacFund</h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-[0.2em] -mt-1 font-bold">Power Your Business</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
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
        </div>
      </nav>

      <main className="relative z-10 max-w-5xl mx-auto pt-20 pb-32 px-6 text-center">
        <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 px-4 py-2 rounded-full text-purple-400 text-xs font-bold mb-8 animate-pulse">
           <Search size={14} /> Find Funding for Your Side Hustle or Business
        </div>
        
        <h1 className="text-6xl md:text-8xl font-black mb-6 tracking-tight">
          Funding <span className="gradient-text">Made Easy</span>
        </h1>
        
        <p className="text-gray-400 text-xl max-w-3xl mx-auto leading-relaxed mb-12">
          Get your NYDA, SEFA, or provincial grant application ready in minutes. 
          Auto-fill forms, upload your ID and documents, and track your applications - all in one place.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-20">
          {[
            { label: 'Funding Options', val: '120+', icon: <Target className="text-indigo-400" /> },
            { label: 'Available Grants', val: 'R500M+', icon: <Banknote className="text-emerald-400" /> },
            { label: 'SA Entrepreneurs', val: '15,000+', icon: <Users className="text-purple-400" /> },
            { label: 'Application Time', val: '15 mins', icon: <Clock className="text-blue-400" /> }
          ].map((stat, i) => (
            <div key={i} className="glass-panel p-8 rounded-3xl">
              <div className="flex justify-center mb-4">{stat.icon}</div>
              <h4 className="text-3xl font-black mb-1">{stat.val}</h4>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-2xl mx-auto mb-16">
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
        </div>

        <div className="max-w-2xl mx-auto relative group">
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
        </div>
      </main>

      <footer className="relative z-10 py-10 border-t border-white/5 text-center text-gray-500 text-sm">
        © 2025 StacFund. Empowering businesses worldwide.
      </footer>
    </div>
  );
};

export default Landing;
