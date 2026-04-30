
import React, { useState } from 'react';
import { X, CheckCircle2, Zap, Rocket, Loader2, CreditCard, Calendar, Lock, ChevronLeft, ShieldCheck, AlertCircle } from 'lucide-react';
import { User } from '../types';
import { usePaystackPayment } from 'react-paystack';

interface PricingModalProps {
  user: User | null;
  onClose: () => void;
  onUpgrade: (plan: 'pro' | 'business', cycle: 'monthly' | 'yearly') => void;
}

const PricingModal: React.FC<PricingModalProps> = ({ user, onClose, onUpgrade }) => {
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'business' | null>(null);
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');
  
  // Checkout State
  const [isProcessing, setIsProcessing] = useState(false);

  const getAmount = (plan: 'pro' | 'business') => {
    if (plan === 'pro') {
      return 799 * 100; // Yearly only R799
    }
    const amountStr = billing === 'monthly' ? '699' : '6999';
    return parseInt(amountStr.replace(',', ''), 10) * 100;
  };

  const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';

  // Pro Config
  const proConfig = {
      reference: 'pro_' + new Date().getTime().toString(),
      email: user?.email || 'user@example.com',
      amount: getAmount('pro'),
      publicKey: publicKey || "pk_test_fallback",
      currency: "ZAR",
  };
  const initializeProPayment = usePaystackPayment(proConfig);

  // Business Config
  const businessConfig = {
      reference: 'bus_' + new Date().getTime().toString(),
      email: user?.email || 'user@example.com',
      amount: getAmount('business'),
      publicKey: publicKey || "pk_test_fallback",
      currency: "ZAR",
  };
  const initializeBusinessPayment = usePaystackPayment(businessConfig);


  const handleSuccess = async (referenceInfo: any, plan: 'pro' | 'business') => {
    console.log("Payment Successful:", referenceInfo);
    setIsProcessing(true);
    
    // Force Founder Pro to yearly if monthly is selected
    const actualBilling = plan === 'pro' ? 'yearly' : billing;

    try {
      // Verify the transaction securely on the backend
      const response = await fetch('/api/paystack/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reference: referenceInfo.reference,
          userId: user?.id,
          plan: plan,
          cycle: actualBilling
        }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.status === true && data.data.status === 'success') {
        onUpgrade(plan, billing);
      } else {
        alert("Payment verification failed. Please contact support.");
        console.error("Verification failed:", data);
      }
    } catch (error) {
      console.error("Error verifying payment:", error);
      alert("Error verifying payment. If you were charged, please contact support.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    console.log("Payment dialog closed.");
  };

  const startCheckout = (plan: 'pro' | 'business') => {
    setSelectedPlan(plan);
    if (!publicKey) {
      alert("DEMO MODE: Paystack API key not found. Simulating a successful upgrade to " + plan + ".");
      onUpgrade(plan, billing);
      return;
    }
    
    if (plan === 'pro') {
      initializeProPayment({ onSuccess: (ref) => handleSuccess(ref, 'pro'), onClose: handleClose });
    } else {
      initializeBusinessPayment({ onSuccess: (ref) => handleSuccess(ref, 'business'), onClose: handleClose });
    }
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

          <>
            {/* Header Section */}
            <div className="text-center pt-10 pb-6 px-6 bg-gradient-to-b from-purple-900/20 to-transparent">
              <h2 className="text-3xl md:text-4xl font-black mb-3">Choose Your Growth Engine</h2>
              <p className="text-gray-400 text-sm max-w-xl mx-auto mb-4">
                Secure recurring funding support. Payments powered by <span className="text-emerald-400 font-bold">Paystack</span>.
              </p>

              {!publicKey && (
                <div className="mx-auto max-w-md bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex gap-3 text-amber-200 text-sm mb-4">
                  <AlertCircle size={20} className="shrink-0 text-amber-400" />
                  <p className="text-left py-0.5">Paystack API key not found. Add <code className="bg-black/50 px-1 py-0.5 rounded text-amber-300">VITE_PAYSTACK_PUBLIC_KEY</code> in settings to enable live checkout.</p>
                </div>
              )}
              
              <div className="flex justify-center mt-4">
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
                    Yearly <span className="bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 rounded-md uppercase tracking-wider">Save up to 55%</span>
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
                        R799
                      </p>
                      <span className="text-sm text-gray-400 font-bold mb-1.5">/yr</span>
                    </div>
                    {billing === 'monthly' && (
                      <div className="mt-1">
                        <span className="text-[10px] text-purple-400 font-black uppercase tracking-widest bg-purple-500/10 px-2 py-0.5 rounded">Yearly Only</span>
                      </div>
                    )}
                    <div className="mt-2 text-emerald-400 text-xs font-black uppercase tracking-wider flex items-center gap-1">
                      <ShieldCheck size={12} /> Save R1,000 Today
                    </div>
                  </div>

                  <div className="space-y-3 mb-8 flex-1">
                    {['Unlimited Live Web Scans', 'AI Business Plan Generator', 'Offline Form Auto-Fill', 'Financial Projections', 'AI Logo Generator/Designer'].map((feat, i) => (
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
                    disabled={isProcessing}
                    className="w-full py-4 rounded-xl bg-white text-black font-black flex items-center justify-center gap-2 hover:bg-gray-200 transition-all shadow-lg disabled:opacity-50"
                  >
                    {isProcessing && selectedPlan === 'pro' ? <Loader2 className="animate-spin" size={20} /> : 'Get Founder Pro'}
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
                        {billing === 'monthly' ? 'R699' : 'R6,999'}
                      </p>
                      <span className="text-sm text-gray-400 font-medium mb-1">/{billing === 'monthly' ? 'mo' : 'yr'}</span>
                    </div>
                  </div>

                  <div className="space-y-3 mb-8 flex-1">
                    {['Everything in Founder', 'AI Business Plan & Logo Gen', 'Unlimited Funding Scans', 'Financial Projections', 'Priority 24/7 Support'].map((feat, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <CheckCircle2 size={16} className="text-amber-500" />
                        <span className="text-sm font-medium text-gray-300">{feat}</span>
                      </div>
                    ))}
                  </div>
                  
                  <button 
                    onClick={() => startCheckout('business')}
                    disabled={isProcessing}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
                  >
                    {isProcessing && selectedPlan === 'business' ? <Loader2 className="animate-spin" size={20} /> : 'Join Empire'}
                  </button>
                </div>

              </div>
            </div>
          </>
      </div>
    </div>
  );
};

export default PricingModal;
