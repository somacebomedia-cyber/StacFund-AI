
import React, { useState } from 'react';
import { X, CheckCircle2, Zap, Rocket, CreditCard, Loader2, ShieldCheck, Lock, ChevronLeft, Calendar } from 'lucide-react';
import { User } from '../types';

interface PricingModalProps {
  user: User | null;
  onClose: () => void;
  onUpgrade: (plan: 'pro' | 'business', cycle: 'monthly' | 'yearly') => void;
}

const PricingModal: React.FC<PricingModalProps> = ({ user, onClose, onUpgrade }) => {
  const [view, setView] = useState<'plans' | 'checkout'>('plans');
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'business' | null>(null);
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');
  
  // Checkout State
  const [cardNumber, setCardNumber] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const startCheckout = (plan: 'pro' | 'business') => {
    setSelectedPlan(plan);
    setView('checkout');
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    
    // SIMULATED PAYMENT GATEWAY DELAY
    // In production, this would be `paystack.open()` or `stripe.confirmCardPayment()`
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    if (selectedPlan) {
        onUpgrade(selectedPlan, billing);
    }
    setIsProcessing(false);
  };

  const formatCard = (value: string) => {
    return value.replace(/\W/gi, '').replace(/(.{4})/g, '$1 ').trim().substring(0, 19);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-6xl bg-[#050510] rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
        >
          <X size={24} />
        </button>

        {view === 'plans' ? (
          <>
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
                  <button disabled className="w-full py-4 rounded-xl bg-white/10 text-gray-400 font-bold cursor-not-allowed">
                    Current Plan
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
                    onClick={() => startCheckout('pro')}
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
                    onClick={() => startCheckout('business')}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-amber-500/20"
                  >
                    Join Empire
                  </button>
                </div>

              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col md:flex-row h-full">
            {/* Checkout Left Summary */}
            <div className="w-full md:w-1/3 bg-[#0a0a1a] p-8 border-r border-white/10 flex flex-col justify-between">
              <div>
                <button onClick={() => setView('plans')} className="text-gray-500 hover:text-white flex items-center gap-2 mb-8 font-bold text-xs uppercase tracking-widest">
                   <ChevronLeft size={14} /> Back to plans
                </button>
                <h3 className="text-2xl font-black mb-1">Order Summary</h3>
                <p className="text-gray-500 text-sm mb-6">Review your subscription details</p>
                
                <div className="bg-white/5 p-6 rounded-2xl border border-white/10 mb-6">
                   <div className="flex justify-between items-center mb-4">
                     <span className="font-bold text-lg capitalize">{selectedPlan === 'pro' ? 'Founder Pro' : 'Empire Business'}</span>
                     <span className="text-xs font-bold bg-purple-500/20 text-purple-400 px-2 py-1 rounded uppercase">{billing}</span>
                   </div>
                   <div className="flex justify-between items-center text-sm text-gray-400 border-t border-white/10 pt-4">
                     <span>Total due today</span>
                     <span className="text-xl font-black text-white">
                       {selectedPlan === 'pro' ? (billing === 'monthly' ? 'R149' : 'R999') : (billing === 'monthly' ? 'R349' : 'R3,499')}
                     </span>
                   </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <ShieldCheck size={14} className="text-emerald-500" />
                Secure 256-bit SSL Encrypted Payment
              </div>
            </div>

            {/* Checkout Right Form */}
            <div className="flex-1 p-8 md:p-12 overflow-y-auto">
               <h3 className="text-2xl font-black mb-6">Payment Details</h3>
               <form onSubmit={handlePayment} className="max-w-md space-y-6">
                 
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Cardholder Name</label>
                   <input type="text" required placeholder="John Doe" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                 </div>

                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Card Number</label>
                   <div className="relative">
                      <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                      <input 
                        type="text" 
                        required 
                        placeholder="0000 0000 0000 0000" 
                        value={cardNumber}
                        onChange={(e) => setCardNumber(formatCard(e.target.value))}
                        maxLength={19}
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-mono" 
                      />
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Expiry</label>
                      <div className="relative">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                        <input type="text" required placeholder="MM/YY" maxLength={5} className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">CVC</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                        <input type="text" required placeholder="123" maxLength={3} className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                      </div>
                    </div>
                 </div>

                 <button 
                   type="submit"
                   disabled={isProcessing}
                   className="w-full py-5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black flex items-center justify-center gap-2 transition-all shadow-xl shadow-purple-500/20 mt-8"
                 >
                   {isProcessing ? <Loader2 size={20} className="animate-spin" /> : `Pay R${selectedPlan === 'pro' ? (billing === 'monthly' ? '149' : '999') : (billing === 'monthly' ? '349' : '3,499')}`}
                 </button>

                 <p className="text-center text-xs text-gray-500">
                   By clicking Pay, you agree to our Terms of Service. You will be billed immediately.
                 </p>
               </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PricingModal;
