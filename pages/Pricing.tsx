
import React, { useState } from 'react';
import { CheckCircle2, Zap, Rocket, ArrowLeft } from 'lucide-react';

interface PricingPageProps {
  onBackToLanding: () => void;
}

const PricingPage: React.FC<PricingPageProps> = ({ onBackToLanding }) => {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');

  const handleSelectPlan = (plan: 'free' | 'pro' | 'business') => {
    console.log(`Selected plan: ${plan}, billing: ${billing}`);
    // Here you would typically redirect to a checkout or registration page
  };

  return (
    <div className="bg-[#050510] text-white min-h-screen">
      <header className="relative z-10 px-6 py-8 flex justify-start items-center max-w-7xl mx-auto">
        <button 
          onClick={onBackToLanding}
          className="flex items-center gap-2 text-gray-400 hover:text-white font-bold transition-all px-4"
        >
          <ArrowLeft size={16} /> Back to Home
        </button>
      </header>

      <div className="relative w-full max-w-6xl mx-auto py-16 px-4">
        {/* Header Section */}
        <div className="text-center pt-10 pb-6 px-6 bg-gradient-to-b from-purple-900/20 to-transparent">
          <h2 className="text-3xl md:text-4xl font-black mb-3">Choose Your Growth Engine</h2>
          <p className="text-gray-400 text-sm max-w-xl mx-auto">
            Secure recurring funding support. Payments processed securely via Paystack.
          </p>
          
          <div className="flex justify-center mt-8">
            <div className="bg-white/5 p-1 rounded-xl flex border border-white/10">
              <button 
                onClick={() => setBilling('monthly')}
                className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${billing === 'monthly' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
              >
                Monthly
              </button>
              <button 
                onClick={() => setBilling('yearly')}
                className={`px-6 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${billing === 'yearly' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
              >
                Yearly <span className="bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded-md uppercase tracking-wider">Save 45%</span>
              </button>
            </div>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            
            {/* Free Tier */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 flex flex-col hover:border-white/20 transition-all">
              <div className="mb-6">
                <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center mb-4 text-gray-400">
                  <Rocket size={24} />
                </div>
                <h3 className="text-xl font-black text-white">Hustler</h3>
              </div>
              <div className="mb-6">
                <p className="text-4xl font-black text-white">R0</p>
                <span className="text-sm text-gray-500 font-medium">Forever free</span>
              </div>
              <div className="space-y-3 mb-8 flex-1">
                {['Basic Funding Search', 'Manual Tracking', '1 Profile'].map((feat, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-gray-500" />
                    <span className="text-sm font-medium text-gray-400">{feat}</span>
                  </div>
                ))}
              </div>
              <button 
                onClick={() => handleSelectPlan('free')}
                className="w-full py-4 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20 transition-all"
              >
                Get Started
              </button>
            </div>

            {/* Pro Tier (Founder) - The Hero */}
            <div className="rounded-3xl border-2 border-purple-500 bg-[#0f0f29] p-8 flex flex-col relative transform md:-translate-y-4 shadow-2xl shadow-purple-500/20">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-purple-500 to-indigo-500"></div>
              <div className="absolute top-4 right-4">
                <span className="bg-purple-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                  Most Popular
                </span>
              </div>
              
              <div className="mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center mb-4 text-white shadow-lg">
                  <Zap size={24} />
                </div>
                <h3 className="text-xl font-black text-white">Founder Pro</h3>
              </div>
              
              <div className="mb-6">
                <div className="flex items-end gap-1">
                  <p className="text-5xl font-black text-white tracking-tight">
                    {billing === 'monthly' ? 'R149' : 'R999'}
                  </p>
                  <span className="text-sm text-gray-400 font-bold mb-1.5">/{billing === 'monthly' ? 'mo' : 'yr'}</span>
                </div>
              </div>

              <div className="space-y-3 mb-8 flex-1">
                {['Unlimited Live Web Scans', 'AI Business Plan Generator', 'Offline Form Auto-Fill', 'Financial Projections'].map((feat, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="bg-purple-500/20 p-0.5 rounded-full">
                        <CheckCircle2 size={14} className="text-purple-400" />
                    </div>
                    <span className="text-sm font-bold text-gray-200">{feat}</span>
                  </div>
                ))}
              </div>
              
              <button 
                onClick={() => handleSelectPlan('pro')}
                className="w-full py-4 rounded-xl bg-white text-black font-black flex items-center justify-center gap-2 hover:bg-gray-200 transition-all shadow-lg"
              >
                Get Founder Pro
              </button>
            </div>

            {/* Business Tier (Empire) */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 flex flex-col hover:border-amber-500/50 hover:bg-amber-500/5 transition-all group">
              <div className="mb-6">
                <h3 className="text-xl font-black text-white group-hover:text-amber-400 transition-colors">Empire</h3>
              </div>
              
              <div className="mb-6">
                <div className="flex items-end gap-1">
                  <p className="text-4xl font-black text-white">
                    {billing === 'monthly' ? 'R349' : 'R3,499'}
                  </p>
                  <span className="text-sm text-gray-400 font-medium mb-1">/{billing === 'monthly' ? 'mo' : 'yr'}</span>
                </div>
              </div>

              <div className="space-y-3 mb-8 flex-1">
                {['Everything in Founder', 'Priority 24/7 Support', 'Advanced AI Agents'].map((feat, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle2 size={16} className="text-amber-500" />
                    <span className="text-sm font-medium text-gray-300">{feat}</span>
                  </div>
                ))}
              </div>
              
              <button 
                onClick={() => handleSelectPlan('business')}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-amber-500/20"
              >
                Join Empire
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
