
import React, { useState } from 'react';
import { FundingOpportunity, FundingType, RoadmapStep } from '../types';
import { Heart, ChevronRight, ChevronDown, CheckCircle2, Share2, Copy, MessageCircle, X, ArrowUpRight, Info } from 'lucide-react';

interface FundingCardProps {
  opportunity: FundingOpportunity;
  onViewDetails: (id: string) => void;
  onStartApplication: (id: string) => void;
}

const FundingCard: React.FC<FundingCardProps> = ({ opportunity, onViewDetails, onStartApplication }) => {
  const [showRoadmap, setShowRoadmap] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const getRoadmap = (type: FundingType): RoadmapStep[] => {
    const baseSteps = [
      { id: '1', label: 'Profile Completion', isCompleted: true, description: 'Verify business details and owner info.' },
      { id: '2', label: 'Document Verification', isCompleted: false, description: 'Upload ID, CIPC, and Tax docs.' },
    ];

    switch (type) {
      case FundingType.GRANT:
        return [
          ...baseSteps,
          { id: '3', label: 'Impact Analysis', isCompleted: false, description: 'Describe the social or economic impact.' },
          { id: '4', label: 'Compliance Check', isCompleted: false, description: 'Verify alignment with grant mandates.' }
        ];
      case FundingType.LOAN:
        return [
          ...baseSteps,
          { id: '3', label: 'Credit Assessment', isCompleted: false, description: 'Analyze creditworthiness and repayment.' },
          { id: '4', label: 'Collateral Review', isCompleted: false, description: 'Verify business assets or guarantees.' }
        ];
      case FundingType.EQUITY:
        return [
          ...baseSteps,
          { id: '3', label: 'Pitch Deck Review', isCompleted: false, description: 'Expert evaluation of business model.' },
          { id: '4', label: 'Due Diligence', isCompleted: false, description: 'Deep dive into financials and legal.' }
        ];
      default:
        return [...baseSteps, { id: '3', label: 'Submission', isCompleted: false, description: 'Final review and send.' }];
    }
  };

  const getTypeColor = (type: FundingType) => {
    switch (type) {
      case FundingType.GRANT: return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case FundingType.EQUITY: return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case FundingType.LOAN: return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case FundingType.COMPETITION: return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/?oppId=${opportunity.id}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsAppShare = () => {
    const text = `Check out this funding opportunity: ${opportunity.title} by ${opportunity.provider}. Range: ${opportunity.range}. Apply now on FundHub!`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const steps = getRoadmap(opportunity.type);

  return (
    <div className={`glass-panel rounded-3xl p-8 mb-6 relative transition-all group overflow-hidden border ${opportunity.isNew ? 'border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.1)]' : 'border-white/5 hover:border-white/20'}`}>
      {/* New Highlight Effect */}
      {opportunity.isNew && (
        <div className="absolute top-0 right-0 overflow-hidden w-24 h-24 pointer-events-none">
          <div className="absolute top-[-10px] right-[-35px] bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[9px] font-black uppercase tracking-tighter py-1 w-[120px] text-center rotate-45 shadow-lg border-b border-white/20">
            Featured
          </div>
        </div>
      )}

      <div className="flex justify-between items-start mb-6">
        <div className="flex gap-4 items-center">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold bg-white/5 transition-transform group-hover:scale-110 ${opportunity.isNew ? 'shadow-[0_0_15px_rgba(168,85,247,0.2)]' : ''}`}>
            {opportunity.type === FundingType.GRANT && <span className="text-emerald-400">$</span>}
            {opportunity.type === FundingType.EQUITY && <span className="text-purple-400">#</span>}
            {opportunity.type === FundingType.LOAN && <span className="text-blue-400">%</span>}
            {opportunity.type === FundingType.COMPETITION && <span className="text-amber-400">★</span>}
          </div>
          <div>
            <h3 className="text-xl font-bold group-hover:text-purple-400 transition-colors">{opportunity.title}</h3>
            <p className="text-gray-400 text-sm">{opportunity.provider}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowShareModal(true)}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/5"
            title="Share Opportunity"
          >
            <Share2 size={18} />
          </button>
          <button className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-red-500 transition-all border border-white/5">
            <Heart size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <span className={`px-3 py-1 rounded-md text-[10px] font-bold border ${getTypeColor(opportunity.type)} uppercase tracking-wider`}>
          {opportunity.type}
        </span>
        {opportunity.isNew && (
          <span className="px-3 py-1 rounded-md text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 uppercase tracking-widest animate-pulse">
            ✨ NEW OPPORTUNITY
          </span>
        )}
      </div>

      <p className="text-gray-300 text-sm leading-relaxed mb-8 line-clamp-2 group-hover:line-clamp-none transition-all duration-500">
        {opportunity.description}
      </p>

      <div className="grid grid-cols-2 gap-8 mb-8">
        <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-1 font-bold">Funding Range</p>
          <p className="text-lg font-black text-white">{opportunity.range}</p>
        </div>
        <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-1 font-bold">Deadline</p>
          <p className="text-lg font-black text-white">{opportunity.deadline}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <button 
          onClick={() => onStartApplication(opportunity.id)}
          className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-purple-500/20 active:scale-[0.98]"
        >
          Start Application <ChevronRight size={18} />
        </button>
        <button 
          onClick={() => onViewDetails(opportunity.id)}
          className="px-6 py-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-black transition-all border border-white/10 flex items-center justify-center gap-2"
        >
          View Opportunity <ArrowUpRight size={18} />
        </button>
        <button 
          onClick={() => setShowRoadmap(!showRoadmap)}
          className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/10 flex items-center justify-center"
          title="Toggle Roadmap"
        >
          {showRoadmap ? <Info size={20} className="text-purple-400" /> : <Info size={20} />}
        </button>
      </div>

      {showRoadmap && (
        <div className="mt-8 pt-8 border-t border-white/5 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 ease-out">
          <h4 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 mb-4 flex items-center gap-2">
            <CheckCircle2 size={14} className="text-purple-400" /> Application Journey
          </h4>
          <div className="relative space-y-8 ml-3">
             <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-white/5"></div>
             {steps.map((step) => (
               <div key={step.id} className="relative flex gap-4 items-start">
                 <div className={`mt-1.5 w-4 h-4 rounded-full flex items-center justify-center z-10 ${step.isCompleted ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-[#1a1a2e] border-2 border-white/10'}`}>
                   {step.isCompleted ? <CheckCircle2 size={10} className="text-white" /> : <div className="w-1 h-1 bg-white/20 rounded-full"></div>}
                 </div>
                 <div>
                   <h5 className={`font-bold text-sm ${step.isCompleted ? 'text-white' : 'text-gray-400'}`}>{step.label}</h5>
                   <p className="text-[10px] text-gray-600 mt-0.5 font-medium">{step.description}</p>
                 </div>
               </div>
             ))}
          </div>
        </div>
      )}

      {/* Share Modal Backdrop */}
      {showShareModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowShareModal(false)}></div>
          <div className="relative bg-[#0a0a1a] border border-white/10 rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-300">
            <button 
              onClick={() => setShowShareModal(false)}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/5 text-gray-500 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto mb-4">
                <Share2 size={32} />
              </div>
              <h3 className="text-xl font-black mb-1">Share Opportunity</h3>
              <p className="text-gray-500 text-sm">Help others discover this grant</p>
            </div>
            <div className="space-y-3">
              <button 
                onClick={handleWhatsAppShare}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/20 hover:bg-[#25D366]/20 text-[#25D366] font-black transition-all"
              >
                <div className="p-2 rounded-lg bg-[#25D366] text-white">
                  <MessageCircle size={20} />
                </div>
                Share to WhatsApp
              </button>
              <button 
                onClick={handleCopyLink}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black transition-all"
              >
                <div className="p-2 rounded-lg bg-gray-800 text-gray-400">
                  <Copy size={20} />
                </div>
                {copied ? 'Copied to Clipboard!' : 'Copy Opportunity Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FundingCard;
